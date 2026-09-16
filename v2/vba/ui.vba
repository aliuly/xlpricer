
' Build the Tools sheet (created on workbook open)
Sub BuildTools()
  Dim ws As Worksheet

  On Error Resume Next
  Set ws = ThisWorkbook.Worksheets("Tools")
  On Error GoTo 0

  If ws Is Nothing Then
    Set ws = ThisWorkbook.Worksheets.Add( _
            After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
    ws.Name = "Tools"
    ' MsgBox "The Tools sheet was created.", vbInformation
    AddToolButtons ws

  Else
    Debug.Print "Tools sheet already exists."
  End If

End Sub

' (Re)create the buttons on the Tools sheet (idempotent)
Sub AddToolButtons(ws As Worksheet)
  Dim i As Long

  ' Remove buttons from a previous open so captions and macros stay current
  For i = ws.Buttons.Count To 1 Step -1
    If ws.Buttons(i).Name Like "btn*" Then
      ws.Buttons(i).Delete
    End If
  Next i

  AddButton ws, "btnAddTab", "Add Components", "AddBOM", 1
  AddButton ws, "btnTrimSheet", "Trim Workbook", "TrimWB", 2
End Sub

Sub AddButton(ws As Worksheet, btnName As String, caption As String, _
              macroName As String, slot As Long)
  Dim btn As Button
  Set btn = ws.Buttons.Add(10, 10 + (slot - 1) * 24, 90, 20)
  btn.Name = btnName
  btn.Caption = caption
  btn.OnAction = macroName
End Sub

' AddBOM lives in bom.vba; TrimWB lives in prep.vba
