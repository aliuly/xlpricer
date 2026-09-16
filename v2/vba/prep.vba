' TrimWB — produce a trimmed, macro-free copy of this workbook.
'
' Flow (SharePoint / AutoSave-safe):
'   1. Ask where to save the .xlsx copy FIRST.  Nothing is modified
'      before this, so the original .xlsm is never touched.
'   2. SaveAs the copy in macro-free format: the VB project is
'      stripped from the saved file, the running code stays in memory.
'   3. Trim the copy: freeze formulas referencing the Prices sheet,
'      then delete the Tools, Prices, Volumes, Finder and _BOMTemplate
'      sheets.
'   4. Save the trimmed copy.
'
' Reference map (verified against the generated workbook):
'   - BOM tabs -> Prices   (must be frozen)
'   - Prices   -> Volumes  (deleted together with Prices)
'   - Finder -> Prices (deleted together with Prices)
'   - everything else references neither

Sub TrimWB()
  Dim newName As Variant
  Dim initName As String
  Dim ws As Worksheet
  Dim cell As Range
  Dim first As String
  Dim searchArea As Range

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
  Application.DisplayAlerts = False
  ThisWorkbook.SaveAs FileName:=newName, FileFormat:=xlOpenXMLWorkbook
  Application.DisplayAlerts = True

  ' 3. Trim the copy
  Application.ScreenUpdating = False
  Application.DisplayAlerts = False

  ' Freeze formulas referencing the Prices sheet (both ref forms)
  For Each ws In ThisWorkbook.Worksheets
    If ws.Name <> "Prices" And ws.Name <> "Volumes" Then
      Set searchArea = ws.UsedRange
      Set cell = searchArea.Find(What:="Prices!", LookIn:=xlFormulas, LookAt:=xlPart)
      If Not cell Is Nothing Then
        first = cell.Address
        Do
          If cell.HasFormula Then cell.Value = cell.Value
          Set cell = searchArea.FindNext(cell)
          If cell Is Nothing Then Exit Do
        Loop While cell.Address <> first
      End If
      Set cell = searchArea.Find(What:="'Prices'!", LookIn:=xlFormulas, LookAt:=xlPart)
      If Not cell Is Nothing Then
        first = cell.Address
        Do
          If cell.HasFormula Then cell.Value = cell.Value
          Set cell = searchArea.FindNext(cell)
          If cell Is Nothing Then Exit Do
        Loop While cell.Address <> first
      End If
    End If
  Next ws

  ' Remove the macro-support and pricing sheets
  On Error Resume Next
  ThisWorkbook.Worksheets("Tools").Delete
  ThisWorkbook.Worksheets("Prices").Delete
  ThisWorkbook.Worksheets("Volumes").Delete
  ThisWorkbook.Worksheets("Finder").Delete
  ThisWorkbook.Worksheets("_BOMTemplate").Delete
  On Error GoTo 0

  Application.DisplayAlerts = True
  Application.ScreenUpdating = True

  ' 4. Persist the trimmed copy
  ThisWorkbook.Save

  ' 5. Reopen the trimmed file in a fresh session.  This session still
  '    carries the VB project in memory, which keeps Excel's "AutoSave
  '    disabled (file contains macros)" banner up; reopening the
  '    macro-free file clears it.
  Dim savedPath As String
  savedPath = ThisWorkbook.FullName
  Application.DisplayAlerts = False
  Shell """" & Application.Path & Application.PathSeparator & "EXCEL.EXE"" """ & savedPath & """", vbNormalFocus
  ThisWorkbook.Close SaveChanges:=False
End Sub
