'
' Test
'


Sub ExportCmpTmpl()
    Dim sourceSheet As Worksheet
    Dim newWorkbook As Workbook
    Dim newSheet As Worksheet, sheetPrices As Worksheet
    
    Dim columnB As Range, columnC As Range, columnF As Range
    Dim lastRow As Long
    Dim sheetName As String
    Dim i As Integer
    Dim sheetNames() As String
    Dim r As Integer, dr As Integer, itrow As Integer
    
    Dim descr As String
    
    
    ' Default worksheet name
    Dim defaultSheetName As String
    defaultSheetName = "Components" ' Change this to your default sheet name
    
    ' Create a dropdown for sheet selection
    ReDim sheetNames(1 To ThisWorkbook.Sheets.Count)
    For i = 1 To ThisWorkbook.Sheets.Count
        If ThisWorkbook.Sheets(i).Visible = xlVeryHidden Then
          GoTo SkipSheet
        End If
        sheetNames(i) = ThisWorkbook.Sheets(i).Name
SkipSheet:
    Next i
    Set sheetPrices = ThisWorkbook.Sheets("Prices")
    
    sheetName = Application.InputBox("Select a worksheet (Default: " & defaultSheetName & ")." & vbCrLf & _
                                     "Available sheets: " & Join(sheetNames, ", "), "Select Worksheet", Default:=defaultSheetName, Type:=2)

    ' Validate user input
    If sheetName = "" Then
        MsgBox "No worksheet selected. Exiting macro.", vbExclamation
        Exit Sub
    End If
    
    On Error Resume Next
    Set sourceSheet = ThisWorkbook.Sheets(sheetName)
    On Error GoTo 0
    
    If sourceSheet Is Nothing Then
        MsgBox "The selected worksheet does not exist. Exiting macro.", vbExclamation
        Exit Sub
    End If
    
    ' Create a new workbook
    Set newWorkbook = Workbooks.Add
    Set newSheet = newWorkbook.Sheets(1)
    newSheet.Name = "Servers"
    
    ' Find the last row with data in the selected columns
    With sourceSheet
        lastRow = .Cells(.Rows.Count, "B").End(xlUp).Row
    End With
    
    ' Place some headers in the new sheet.
    newSheet.Range("A1").Value = "HyperCompare - Server Import Data"
    newSheet.Range("A2").Value = "name"
    newSheet.Range("B2").Value = "role"
    newSheet.Range("C2").Value = "os"
    newSheet.Range("D2").Value = "vcpu"
    newSheet.Range("E2").Value = "ram_gb"
    newSheet.Range("F2").Value = "disk1_gb"
    newSheet.Range("G2").Value = "disk1_type"
    newSheet.Range("J2").Value = "workload_tag"
    newSheet.Range("K2").Value = "count"
    newSheet.Range("L2").Value = "managed"
    newSheet.Range("M2").Value = "region"
    
    
    dr = 3
    For r = 6 To lastRow
      descr = sourceSheet.Range("D" & r).Value
      If descr = "" Or Left(descr, Len("Compute: ")) <> "Compute: " Then
        GoTo SkipRow
      End If
      
      itrow = sourceSheet.Range("U" & r).Value  ' RowIdx
      newSheet.Range("A" & dr).Value = descr
      
      ' Map the role's depending on the server type
      '
      ' This is a rough mapping hardly accurage
      If sheetPrices.Range("S" & itrow) = "memo" Or sheetPrices.Range("S" & itrow) = "dins" Or sheetPrices.Range("S" & itrow) = "uhio" Then
        newSheet.Range("B" & dr).Value = "database"
      ElseIf sheetPrices.Range("S" & itrow) = "ecs" Then
        newSheet.Range("B" & dr).Value = "webserver"
      ElseIf sheetPrices.Range("S" & itrow) = "ecsnoc" Then
        newSheet.Range("B" & dr).Value = "appserver"
      Else
        newSheet.Range("B" & dr).Value = "other"
      End If
     
      If sheetPrices.Range("H" & itrow) = "Windows" Then
        newSheet.Range("C" & dr).Value = "windows"
      Else
        newSheet.Range("C" & dr).Value = "linux"
      End If
      
      ' vCPU
      newSheet.Range("D" & dr).Value = sourceSheet.Range("R" & r).Value
      ' RAM
      newSheet.Range("E" & dr).Value = sourceSheet.Range("S" & r).Value
      
      ' Storage
      newSheet.Range("F" & dr).Value = sourceSheet.Range("F" & r).Value
      If sourceSheet.Range("L" & r).Value = "Extreme SSD" Then
        newSheet.Range("G" & dr).Value = "ssd-ultra"
      ElseIf sourceSheet.Range("L" & r).Value = "High I/O" Then
        newSheet.Range("G" & dr).Value = "hdd"
      Else
        newSheet.Range("G" & dr).Value = "ssd"
      End If

      ' workload tag
      newSheet.Range("J" & dr).Value = sourceSheet.Range("C" & r).Value
      ' count
      newSheet.Range("K" & dr).Value = sourceSheet.Range("B" & r).Value
      ' hard coded to managed = NO
      newSheet.Range("L" & dr).Value = "no"
      ' Region
      If sourceSheet.Range("K" & r).Value = "eu-nl" Then
        newSheet.Range("M" & dr).Value = "Netherlands"
      Else
        newSheet.Range("M" & dr).Value = "Germany"
      End If
      
      dr = dr + 1
SkipRow:
    Next r
    
End Sub



