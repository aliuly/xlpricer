Short answer: **ExcelJS doesn't support macros natively.** There's a long-standing open issue for it (`exceljs/exceljs#605`, opened in 2018) that's a request to embed a VBA script into a workbook so it runs on open, and there's still no built-in API for it.

The standard workaround (used by basically every OOXML library that has this limitation) is:

## Why you can't generate the macro code itself in JS

A vbaProject.bin file is a binary OLE COM container, not XML like the rest of the xlsx/xlsm structure, so it isn't practical to build one from scratch — the accepted workaround is to extract an existing vbaProject.bin from a real .xlsm file and reuse it. Practically: you write the macro once in Excel, save that file as `.xlsm`, and extract the binary blob to reuse as a static asset in your build pipeline.

## The approach

1. **Author the macro in Excel** and save as `template.xlsm`.
2. **Extract `vbaProject.bin`** from it — it lives at `xl/vbaProject.bin` inside the zip. You can literally do `unzip -j template.xlsm xl/vbaProject.bin`.
3. **Generate your workbook with ExcelJS as normal.**
4. **Post-process the output** with a zip library (JSZip, which ExcelJS already depends on) to:
   - inject `xl/vbaProject.bin`
   - flip the workbook's content type to the macro-enabled variant
   - add the relationship so Excel knows to load it
5. **Save with a `.xlsm` extension.**

```ts
import ExcelJS from "exceljs";
import JSZip from "jszip";
import fs from "fs/promises";

async function addMacro(xlsxBuffer: Buffer, vbaProjectPath: string): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsxBuffer);

  // 1. Add the VBA binary
  const vbaBin = await fs.readFile(vbaProjectPath);
  zip.file("xl/vbaProject.bin", vbaBin);

  // 2. Update [Content_Types].xml
  const contentTypesPath = "[Content_Types].xml";
  let contentTypes = await zip.file(contentTypesPath)!.async("string");

  contentTypes = contentTypes.replace(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml"
  );
  if (!contentTypes.includes("vbaProject.bin")) {
    contentTypes = contentTypes.replace(
      "</Types>",
      `<Override PartName="/xl/vbaProject.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>`
    );
  }
  zip.file(contentTypesPath, contentTypes);

  // 3. Add relationship in xl/_rels/workbook.xml.rels
  const relsPath = "xl/_rels/workbook.xml.rels";
  let rels = await zip.file(relsPath)!.async("string");
  if (!rels.includes("vbaProject.bin")) {
    rels = rels.replace(
      "</Relationships>",
      `<Relationship Id="rIdVBA1" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/></Relationships>`
    );
  }
  zip.file(relsPath, rels);

  return zip.generateAsync({ type: "nodebuffer" });
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Data");
  sheet.addRow(["Hello", "World"]);

  const xlsxBuffer = (await workbook.xlsx.writeBuffer()) as Buffer;
  const xlsmBuffer = await addMacro(xlsxBuffer, "./template-vbaProject.bin");

  await fs.writeFile("output.xlsm", xlsmBuffer);
}

main();
```

A few things worth knowing before you rely on this:

- **The `.xlsm` extension is mandatory.** Excel checks the extension, not just the internal content type — a macro-enabled file saved as `.xlsx` will have its macros stripped or refuse to open correctly.
- **You can't parameterize the VBA code from JS at runtime** — it's a fixed binary blob. If you need different macro logic per output, you'll need multiple pre-built `vbaProject.bin` templates, or generate them via a scripted Excel/COM automation step (Windows-only, e.g. via PowerShell + Excel COM), which is a different can of worms.
- **Signed macros** need an extra `vbaProjectSignature.bin` part and relationship if you want the signature preserved — skip this if your macros are unsigned.
- Test the round-trip carefully: Excel is picky about `[Content_Types].xml` and relationship ordering, and a malformed file can trigger a repair prompt.

If macros are a core, recurring requirement (not a one-off), it may be worth evaluating [SheetJS Pro](https://docs.sheetjs.com/docs/csf/features/vba/) or a .NET-based library like Aspose.Cells or EPPlus, which have first-class VBA project APIs — e.g. you can add modules to a workbook's VBA project and set their code directly rather than hand-patching zip internals.

That's a genuinely good idea, and it sidesteps the hardest part of the problem — as long as you're clear about *when* it runs.

## The core trick

Instead of trying to fabricate the OOXML/VML/ActiveX parts yourself (fragile, undocumented, easy to corrupt), let Excel's own VBA object model build the controls at runtime. VBA has full APIs for this:

```vba
' Form control (legacy, lightweight, cell-linked)
Sub AddFormCheckbox(ws As Worksheet, r As Long, linkCell As String)
    Dim shp As Shape
    Set shp = ws.Shapes.AddFormControl(xlCheckBox, 100, ws.Rows(r).Top, 90, 18)
    shp.ControlFormat.LinkedCell = linkCell
    shp.OnAction = "ThisWorkbook.HandleCheckbox"
End Sub

' ActiveX control (richer, event-driven)
Sub AddActiveXCheckbox(ws As Worksheet, r As Long)
    Dim ole As OLEObject
    Set ole = ws.OLEObjects.Add(ClassType:="Forms.CheckBox.1", _
        Left:=100, Top:=ws.Rows(r).Top, Width:=90, Height:=18)
    ole.Name = "chkRow" & r
    ole.Object.Caption = "Row " & r
End Sub
```

Then wire it to run automatically:

```vba
Private Sub Workbook_Open()
    Dim ws As Worksheet: Set ws = ThisWorkbook.Sheets("Data")
    Dim lastRow As Long, i As Long
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row

    ' Idempotency: clear any controls added on a previous open
    Dim shp As Shape
    For Each shp In ws.Shapes
        If shp.Type = msoFormControl Then shp.Delete
    Next shp

    For i = 2 To lastRow
        AddFormCheckbox ws, i, "C" & i
    Next i
End Sub
```

This is stored in `vbaProject.bin` exactly like any other macro — you're not generating anything new on the JS side, you're just authoring this macro once in the template alongside whatever else it does.

## Why this is the right division of labor

- **ExcelJS writes pure data** into the sheet — rows, values, formatting. No controls, no OOXML gymnastics.
- **The macro discovers shape from the data at open-time** — it reads `lastRow`, or a config range, or whatever signal you want, and builds exactly the right number of controls, positioned against exactly the right rows. You don't need to tell VBA in advance "put 47 checkboxes here" — it figures that out by inspecting what ExcelJS wrote.
- You never touch worksheet XML, drawing parts, or ActiveX binaries from Node at all. Zero risk of a "we found a problem with some content" repair prompt.

## Two things to be upfront about

**1. This only happens when a human opens the file in real Excel with macros enabled.** The controls don't exist in the file the moment it leaves your server — they're materialized by Excel executing `Workbook_Open`. That means:
- The recipient will see the standard macro security bar and has to click "Enable Content." That's normal for any `.xlsm`, but worth setting expectations for.
- If the file was downloaded from the internet, Windows may mark it with the Mark-of-the-Web, and some org policies block VBA execution on MOTW files outright regardless of user consent — worth checking your target environment's macro policy if this is for a broad audience.
- If anything downstream consumes the file **without** running it through real Excel (a headless converter, an OOXML parser, Google Sheets import, a PDF export pipeline), the controls simply won't be there — because nothing ever built them.

**2. If you instead need the controls to already be baked into the file the moment it leaves your server** (no reliance on the recipient's Excel executing anything), that's a different, heavier ask: you'd need to actually drive Excel via COM automation as part of your generation pipeline — open the workbook, let/force the macro run, save, close. That requires a real licensed Excel install, is Windows-only, and Microsoft explicitly advises against unattended server-side Office automation (it's not designed or supported for that — no interactive desktop session, dialog boxes can hang the process, licensing terms are murky for server scenarios). It's done in practice, but it's a meaningfully more fragile piece of infrastructure than "generate a file and hand it out."

So: if your use case is "internal users open this in their own Excel," the `Workbook_Open`-driven approach is clean, robust, and exactly the right way to do dynamic controls without fighting the OOXML format directly. If you need statically-baked controls with no macro execution required on the recipient's end, that pushes you toward COM automation or a proper commercial library like Aspose.Cells that can write ActiveX/form-control parts directly and deterministically.

***
* 
