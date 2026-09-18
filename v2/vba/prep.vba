' TrimWB — produce a trimmed, macro-free copy of this workbook.
'
' Flow (SharePoint / AutoSave-safe):
'   1. Ask where to save the .xlsx copy FIRST.  Nothing is modified
'      before this, so the original .xlsm is never touched.
'   2. SaveAs the copy in macro-free format: the VB project is
'      stripped from the saved file, the running code stays in memory.
'   3. Trim the copy: freeze formulas referencing the Prices sheet,
'      then delete the Tools, Prices, Volumes, Finder and _BOMTemplate
'      sheets and hide the T machinery sheet.
'   4. Save the trimmed copy.
'
' Reference map (verified against the generated workbook):
'   - BOM tabs -> Prices via PriceList* defined names (2.0.1+) or
'     literal Prices! refs (pre-2.0.1)   (must be frozen)
'   - Prices   -> Volumes  (deleted together with Prices)
'   - Finder -> Prices (deleted together with Prices)
'   - PriceList* defined names and PriceList* data validations are
'     deleted with Prices
'   - _Frozen (veryHidden) records every frozen formula for revival
'     by the refresh — LiveRef / OriginalAddress / FormulaText
'   - T (veryHidden after trim) carries the XLPricer identity, the
'     pricing provenance and the T_ONE_TIME anchor; the refresh
'     rebuild regenerates T and restores its visibility
'   - everything else references neither

Sub TrimWB()
  Dim newName As Variant
  Dim initName As String
  Dim ws As Worksheet
  Dim cell As Range
  Dim first As String
  Dim searchArea As Range
  Dim nm As Name
  Dim dvArea As Range
  Dim dvCell As Range
  Dim n As Long
  Dim wsIndex As Long
  Dim dvCount As Long

  On Error GoTo TrimFail

  ' 1. Target file first: cancel = do nothing at all.
  '    Anchor the dialog to the workbook's own folder; fall back to a
  '    bare name when the path is unknown or a SharePoint URL (the
  '    classic dialog cannot browse URLs).
  initName = Replace(ThisWorkbook.Name, ".xlsm", ".xlsx", 1, -1, vbTextCompare)
  If ThisWorkbook.Path <> "" And Not (ThisWorkbook.Path Like "http*") Then
    initName = ThisWorkbook.Path & Application.PathSeparator & initName
  End If
  newName = Application.GetSaveAsFilename( _
      InitialFileName:=initName, _
      FileFilter:="Excel Workbook (*.xlsx), *.xlsx")
  If newName = False Then Exit Sub

  ' 2. Macro-free copy; the original stays untouched
  TrimStatus "saving macro-free copy…"
  Application.DisplayAlerts = False
  ThisWorkbook.SaveAs FileName:=newName, FileFormat:=xlOpenXMLWorkbook
  Application.DisplayAlerts = True

  ' 3. Trim the copy
  Application.ScreenUpdating = False
  Application.DisplayAlerts = False

  ' Freeze formulas referencing the Prices sheet:
  '  - PriceList* defined names (2.0.1+ convention)
  '  - literal refs (pre-2.0.1 workbooks)
  For Each nm In ThisWorkbook.Names
    If nm.Name Like "PriceList*" Then FreezeRefs nm.Name
  Next nm
  FreezeRefs "Prices!"
  FreezeRefs "'Prices'!"

  ' Remove data validations whose list source is a PriceList* name
  wsIndex = 0
  For Each ws In ThisWorkbook.Worksheets
    If Not SkipTrimSheet(ws.Name) Then
      wsIndex = wsIndex + 1
      TrimStatus "cleaning data validations — " & ws.Name & " (" & wsIndex & ")"
      On Error Resume Next
      Set dvArea = ws.UsedRange.SpecialCells(xlCellTypeAllValidation)
      On Error GoTo 0
      If Not dvArea Is Nothing Then
        For Each dvCell In dvArea
          On Error Resume Next
          If Left(UCase(dvCell.Validation.Formula1), 9) = "PRICELIST" Then
            dvCell.Validation.Delete
          End If
          On Error GoTo 0
          dvCount = dvCount + 1
          If dvCount Mod 100 = 0 Then
            TrimStatus "cleaning data validations — " & dvCount & " checked"
          End If
        Next dvCell
      End If
    End If
  Next ws

  ' Remove the macro-support and pricing sheets
  TrimStatus "removing macro and pricing sheets…"
  On Error Resume Next
  ThisWorkbook.Worksheets("Tools").Delete
  ThisWorkbook.Worksheets("Prices").Delete
  ThisWorkbook.Worksheets("Volumes").Delete
  ThisWorkbook.Worksheets("Finder").Delete
  ThisWorkbook.Worksheets("_BOMTemplate").Visible = xlSheetVisible
  ThisWorkbook.Worksheets("_BOMTemplate").Delete
  ' Hide the T machinery sheet (identity + provenance + T_ONE_TIME
  ' anchor); it must survive for the refresh revival, which restores
  ' its visibility.  Guarded: pre-T workbooks have no such sheet.
  ThisWorkbook.Worksheets("T").Visible = xlSheetVeryHidden
  On Error GoTo 0

  ' Delete Prices-scoped defined names (PriceList* convention)
  For n = ThisWorkbook.Names.Count To 1 Step -1
    If ThisWorkbook.Names(n).Name Like "PriceList*" Then
      ThisWorkbook.Names(n).Delete
    End If
    If (ThisWorkbook.Names.Count - n + 1) Mod 50 = 0 Then
      TrimStatus "removing PriceList defined names — " & _
          (ThisWorkbook.Names.Count - n + 1) & "/" & ThisWorkbook.Names.Count
    End If
  Next n

  Application.DisplayAlerts = True
  Application.ScreenUpdating = True

  ' 4. Persist the trimmed copy
  TrimStatus "saving trimmed copy…"
  ThisWorkbook.Save

  ' 5. Reopen the trimmed file in a fresh session.  This session still
  '    carries the VB project in memory, which keeps Excel's "AutoSave
  '    disabled (file contains macros)" banner up; reopening the
  '    macro-free file clears it.
  Dim savedPath As String
  savedPath = ThisWorkbook.FullName
  TrimStatus "reopening trimmed workbook…"
  Application.DisplayAlerts = False
  Shell """" & Application.Path & Application.PathSeparator & "EXCEL.EXE"" """ & savedPath & """", vbNormalFocus
  Application.StatusBar = False
  ThisWorkbook.Close SaveChanges:=False
  Exit Sub

TrimFail:
  Application.StatusBar = False
  Application.DisplayAlerts = True
  Application.ScreenUpdating = True
  MsgBox "TrimWB failed: " & Err.Description, vbExclamation, "TrimWB"
End Sub

' Freeze every formula containing `what` (formula-text search, part
' match).  Used for the PriceList* defined names and the literal
' Prices! reference forms.
'
' Snapshots the sheet's formulas into a VBA array and iterates the
' array exactly once; the matching cells are located from the array
' indices and frozen.  Array iteration cannot revisit cells the way
' Range.Find/FindNext (or a live SpecialCells enumeration) can.
Private Sub FreezeRefs(ByVal what As String)
  Dim ws As Worksheet
  Dim cell As Range
  Dim searchArea As Range
  Dim formulas As Variant
  Dim frozenCount As Long
  Dim wsIndex As Long
  Dim wsCount As Long
  Dim r As Long
  Dim c As Long
  Dim startRow As Long
  Dim startCol As Long

  TrimStatus "freezing " & what & " references…"

  wsCount = 0
  For Each ws In ThisWorkbook.Worksheets
    If Not SkipTrimSheet(ws.Name) Then
      wsCount = wsCount + 1
    End If
  Next ws

  wsIndex = 0
  For Each ws In ThisWorkbook.Worksheets
    If Not SkipTrimSheet(ws.Name) Then
      wsIndex = wsIndex + 1
      TrimStatus "freezing " & what & " — " & ws.Name & _
          " (" & wsIndex & "/" & wsCount & ", " & frozenCount & " frozen)"
      Set searchArea = ws.UsedRange
      startRow = searchArea.Row
      startCol = searchArea.Column
      formulas = searchArea.Formula

      ' Range.Formula returns a scalar for a one-cell UsedRange;
      ' normalise it into a 1x1 2-D array so the loops below are
      ' uniform.
      If Not IsArray(formulas) Then
        Dim singleCellFormula As Variant
        singleCellFormula = formulas
        ReDim formulas(1 To 1, 1 To 1)
        formulas(1, 1) = singleCellFormula
      End If

      For r = LBound(formulas, 1) To UBound(formulas, 1)
        For c = LBound(formulas, 2) To UBound(formulas, 2)
          If Not IsError(formulas(r, c)) And Not IsNull(formulas(r, c)) Then
            If InStr(1, CStr(formulas(r, c)), what, vbTextCompare) > 0 Then
              Set cell = ws.Cells(startRow + r - LBound(formulas, 1), _
                  startCol + c - LBound(formulas, 2))
              RecordFrozen cell
              cell.Value = cell.Value
              frozenCount = frozenCount + 1
              If frozenCount Mod 25 = 0 Then
                TrimStatus "freezing " & what & " — " & frozenCount & " frozen"
              End If
            End If
          End If
        Next c
      Next r
    End If
  Next ws

  TrimStatus "froze " & frozenCount & " references for " & what
End Sub

' Update the Excel status bar.  DoEvents lets Excel repaint during
' long loops; called only at coarse intervals, not per cell.
Private Sub TrimStatus(ByVal msg As String)
  Application.StatusBar = "TrimWB: " & msg
  DoEvents
End Sub

' Sheets TrimWB deletes (or the _Frozen recorder itself) must not be
' scanned: recording frozen cells for a sheet that is about to be
' removed would leave revival entries pointing at a missing sheet.
Private Function SkipTrimSheet(ByVal wsName As String) As Boolean
  SkipTrimSheet = wsName = "Prices" Or wsName = "Volumes" _
      Or wsName = "Finder" Or wsName = "_BOMTemplate" _
      Or wsName = "Tools" Or wsName = "_Frozen"
End Function

' Record a frozen cell in the veryHidden _Frozen sheet:
'   A = LiveRef formula (Excel/LibreOffice keep it pointed at the
'       logical cell through structural edits; evaluates to the
'       frozen value), B = original address text,
'   C = formula text (no leading '=').
' Consumed by the refresh revival (src/xlsx/reprice.ts).
Private Sub RecordFrozen(ByVal cell As Range)
  Dim frz As Worksheet
  Dim r As Long
  Dim sheetQ As String

  On Error Resume Next
  Set frz = ThisWorkbook.Worksheets("_Frozen")
  On Error GoTo 0
  If frz Is Nothing Then
    Set frz = ThisWorkbook.Worksheets.Add( _
            After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    frz.Name = "_Frozen"
    ' Machinery sheet — hidden like the TS trim's _Frozen (and T).
    frz.Visible = xlSheetVeryHidden
    frz.Cells(1, 1).Value = "LiveRef"
    frz.Cells(1, 2).Value = "OriginalAddress"
    frz.Cells(1, 3).Value = "FormulaText"
  End If
  r = frz.Cells(frz.Rows.Count, 1).End(xlUp).Row + 1
  sheetQ = "'" & Replace(cell.Worksheet.Name, "'", "''") & "'"
  frz.Cells(r, 1).Formula = "=" & sheetQ & "!" & cell.Address
  frz.Cells(r, 2).Value = sheetQ & "!" & cell.Address
  frz.Cells(r, 3).Value = Mid(cell.Formula, 2)
End Sub
