; Custom NSIS installer script for Simple PDF Reader
; This registers the application as a PDF handler

!macro customInstall
  ; Write registry keys for PDF file association
  WriteRegStr HKLM "Software\Classes\.pdf\OpenWithProgids" "SimplePDFReader.pdf" ""
  WriteRegStr HKLM "Software\Classes\SimplePDFReader.pdf" "" "PDF Document"
  WriteRegStr HKLM "Software\Classes\SimplePDFReader.pdf\DefaultIcon" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKLM "Software\Classes\SimplePDFReader.pdf\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  
  ; Register as a capable application for PDF
  WriteRegStr HKLM "Software\RegisteredApplications" "SimplePDFReader" "Software\SimplePDFReader\Capabilities"
  WriteRegStr HKLM "Software\SimplePDFReader\Capabilities" "ApplicationDescription" "Simple PDF Reader - A lightweight PDF viewer"
  WriteRegStr HKLM "Software\SimplePDFReader\Capabilities" "ApplicationName" "Simple PDF Reader"
  
  ; Register file associations
  WriteRegStr HKLM "Software\SimplePDFReader\Capabilities\FileAssociations" ".pdf" "SimplePDFReader.pdf"
  
  ; Notify the system of the association change
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ; Remove registry keys on uninstall
  DeleteRegKey HKLM "Software\Classes\SimplePDFReader.pdf"
  DeleteRegValue HKLM "Software\Classes\.pdf\OpenWithProgids" "SimplePDFReader.pdf"
  DeleteRegKey HKLM "Software\SimplePDFReader"
  DeleteRegValue HKLM "Software\RegisteredApplications" "SimplePDFReader"
  
  ; Notify the system of the association change
  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend
