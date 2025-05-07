import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import PO1Editor from './component/PO1Editor';
import './styles.css';

interface PO1Data {
  line: string;
  include: boolean;
  dependentSegments: string[];
}

function App() {
  const [formDataISA, setFormDataISA] = useState({
    sender_id_qualifier: 'ZZ',
    sender_id: '',
    receiver_id_qualifier: 'ZZ',
    receiver_id: '',
  });

  const [formDataGS, setFormDataGS] = useState({
    sender_id: '',
    receiver_id: '',
    purchase_order_number: '',
    purchase_date: '',
  });

  const [uploadedFileData, setUploadedFileData] = useState({
    isaVersion: '00501',
    usageIndicator: 'U',
  });
  const [po1Data, setPo1Data] = useState<PO1Data[]>([]);
  const [dtmData, setDtmData] = useState<any[]>([]);
  const [counter, setCounter] = useState(0);
  const [updatedFiles, setUpdatedFiles] = useState<{ name: string; content: string }[]>([]);
  const [generatedContent, setGeneratedContent] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [processingMode, setProcessingMode] = useState<'single' | 'bulk'>('single');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFileContents, setProcessedFileContents] = useState<{ [key: string]: string }>({});
  const [transactionSetNumbers, setTransactionSetNumbers] = useState<string[]>([]);
  const [isPo1SelectionPendingSave, setIsPo1SelectionPendingSave] = useState(false); // Track if selected PO1 lines need saving

  const EndsTilde = (line: string): string => {
    return line.trim().replace(/~$/, '') + '~';
  };

  const generateControlNumber = (index: number): string => {
    const base = parseInt(Date.now().toString().slice(-9)) + index;
    return base.toString().padStart(9, '0').slice(-9);
  };

  const handleChangeISA = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormDataISA((prev) => ({ ...prev, [id]: value }));
  };

  const handleChangeGS = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormDataGS((prev) => ({ ...prev, [id]: value }));
  };

  const handlePO1Change = (index: number, value: string) => {
    console.log(`App: Updating PO1 at index ${index} to:`, value);
    setPo1Data((prev) => {
      const newData = [...prev];
      newData[index] = { ...newData[index], line: value };
      return newData;
    });
  };

  const handlePO1IncludeChange = (index: number, include: boolean) => {
    console.log(`App: Setting include for PO1 at index ${index} to:`, include);
    setPo1Data((prev) => {
      const newData = [...prev];
      newData[index] = { ...newData[index], include };
      return newData;
    });
  };

  const getFormattedDateTime = () => {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  };

  const processFile = (content: string) => {
    console.log('Processing file content:', content);
    const isSingleLine = !content.includes('\n');
    const segments = isSingleLine
      ? content.split(/~/).map((s) => s.trim()).filter(Boolean)
      : content.split(/\r?\n/).map((s) => s.trim().replace(/~$/, '')).filter(Boolean);

    let updatedISA = { ...formDataISA };
    let updatedGS = { ...formDataGS };
    let newUploadedData = { ...uploadedFileData };
    let dtmEntries: any[] = [];
    let po1Entries: PO1Data[] = [];
    let currentPO1: PO1Data | null = null;
    let expectingPO4 = false;
    let expectingAMT = false;
    const transactionSetNumbers: string[] = [];
    const seenQualifiers: { [key: string]: boolean } = {};

    segments.forEach((line) => {
      const trimmedLine = line.trim().replace(/~$/, '');
      if (!trimmedLine) return;

      const parts = trimmedLine.split('*');

      if (parts[0] === 'ST' && parts.length > 1) {
        transactionSetNumbers.push(parts[1]);
      }

      if (parts[0] === 'PO1') {
        if (currentPO1) {
          po1Entries.push(currentPO1);
        }
        currentPO1 = {
          line: trimmedLine,
          include: false,
          dependentSegments: [],
        };
        expectingPO4 = true;
        expectingAMT = false;
      } else if (currentPO1 && expectingPO4 && parts[0] === 'PO4') {
        currentPO1.dependentSegments.push(trimmedLine);
        expectingPO4 = false;
        expectingAMT = true;
      } else if (currentPO1 && expectingAMT && parts[0] === 'AMT') {
        currentPO1.dependentSegments.push(trimmedLine);
        expectingAMT = false;
      } else if (parts[0] === 'ISA') {
        updatedISA.sender_id_qualifier = parts[5]?.trim() || 'ZZ';
        updatedISA.sender_id = parts[6]?.trim() || '';
        updatedISA.receiver_id_qualifier = parts[7]?.trim() || 'ZZ';
        updatedISA.receiver_id = parts[8]?.trim() || '';
        newUploadedData.usageIndicator = parts[11]?.trim() || 'U';
        newUploadedData.isaVersion = parts[12]?.trim() || '00501';
      } else if (parts[0] === 'GS') {
        updatedGS.sender_id = parts[2]?.trim() || '';
        updatedGS.receiver_id = parts[3]?.trim() || '';
      } else if (parts[0] === 'BEG') {
        updatedGS.purchase_order_number = processingMode === 'single' ? formDataGS.purchase_order_number || parts[3]?.trim() || '' : parts[3]?.trim() || '';
        updatedGS.purchase_date = processingMode === 'single' ? formDataGS.purchase_date || parts[5]?.trim() || '' : parts[5]?.trim() || '';
      } else if ((parts[0] === 'DTM' || parts[0] === 'G62') && parts.length >= 3 && !currentPO1) {
        const qualifier = parts[1]?.trim() || '';
        const segmentType = parts[0];
        const date = parts[2]?.trim() || '';
        const key = `${segmentType}_${qualifier}_${date}`;
        if (!seenQualifiers[key]) {
          dtmEntries.push({
            qualifier_id: qualifier,
            date: date,
            original_qualifier_id: qualifier,
            original_date: date,
            segment_type: segmentType,
          });
          seenQualifiers[key] = true;
        }
      }
    });

    if (currentPO1) {
      po1Entries.push(currentPO1);
    }

    console.log('Processed po1Entries:', po1Entries);

    return {
      updatedISA,
      updatedGS,
      newUploadedData,
      dtmEntries,
      po1Entries,
      isSingleLine,
      transactionSetNumbers,
    };
  };

  const processAllFiles = (files: File[]) => {
    if (files.length === 0) return;

    const newProcessedContents = { ...processedFileContents };
    let processedCount = 0;
    const allTransactionNumbers: string[] = [];

    files.forEach((file) => {
      const reader = new FileReader();
      reader.readAsText(file);

      reader.onload = (e) => {
        if (!e.target || typeof e.target.result !== 'string') return;

        const content = e.target.result;
        newProcessedContents[file.name] = content;
        
        const result = processFile(content);
        allTransactionNumbers.push(...result.transactionSetNumbers);

        processedCount++;
        if (processedCount === files.length) {
          setProcessedFileContents(newProcessedContents);
          setTransactionSetNumbers(Array.from(new Set(allTransactionNumbers)));
        }
      };

      reader.onerror = () => {
        console.error(`Error reading file ${file.name}`);
        processedCount++;
        if (processedCount === files.length) {
          setProcessedFileContents(newProcessedContents);
          setTransactionSetNumbers(Array.from(new Set(allTransactionNumbers)));
        }
      };
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || !files.length) return;
  
    console.log('Files uploaded:', files);
    const fileArray = Array.from(files);
    setUploadedFiles(fileArray);
    const newProcessingMode = fileArray.length > 1 ? 'bulk' : 'single';
    setProcessingMode(newProcessingMode);
    setCounter(0);
    setIsPo1SelectionPendingSave(false); // Reset on new file upload
  
    if (newProcessingMode === 'bulk') {
      setFormDataISA({
        sender_id_qualifier: 'ZZ',
        sender_id: '',
        receiver_id_qualifier: 'ZZ',
        receiver_id: '',
      });
      setFormDataGS({
        sender_id: '',
        receiver_id: '',
        purchase_order_number: '',
        purchase_date: '',
      });
      setPo1Data([]);
      setDtmData([
        {
          qualifier_id: '',
          date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          original_qualifier_id: '',
          original_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          segment_type: 'DTM',
        },
      ]);
      setGeneratedContent('');
      processAllFiles(fileArray);
    } else {
      const reader = new FileReader();
      reader.readAsText(files[0]);
  
      reader.onload = (e) => {
        if (!e.target || typeof e.target.result !== 'string') return;
  
        const content = e.target.result;
        console.log('File content loaded:', content);
        const newProcessedContents = { ...processedFileContents };
        newProcessedContents[files[0].name] = content;
        setProcessedFileContents(newProcessedContents);
  
        const result = processFile(content);
        setFormDataISA(result.updatedISA);
        setFormDataGS(result.updatedGS);
        setPo1Data(result.po1Entries);
        setDtmData(
          result.dtmEntries.length
            ? result.dtmEntries
            : [
                {
                  qualifier_id: '',
                  date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                  original_qualifier_id: '',
                  original_date: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
                  segment_type: 'DTM',
                },
              ]
        );
        setUploadedFileData(result.newUploadedData);
        setTransactionSetNumbers(result.transactionSetNumbers);
      };
  
      reader.onerror = () => {
        toast.error('Error reading file. Please try again.', {
          position: 'top-right',
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      };
    }
  };

  const updateBulkDTM = (daysToAdd: number) => {
    const newProcessedContents = { ...processedFileContents };
  
    Object.keys(newProcessedContents).forEach((fileName) => {
      const content = newProcessedContents[fileName];
      const isSingleLine = !content.includes('\n');
      const lines = isSingleLine
        ? content.split(/~/).map((s) => s.trim()).filter(Boolean)
        : content.split(/\r?\n/).map((s) => s.trim().replace(/~$/, '')).filter(Boolean);
  
      const updatedLines = lines.map((line) => {
        const parts = line.split('*');
        if ((parts[0] === 'DTM' || parts[0] === 'G62') && parts.length >= 3) {
          const originalDate = parts[2];
          let dateObj;
  
          if (originalDate.length === 8) {
            const year = parseInt(originalDate.substring(0, 4), 10);
            const month = parseInt(originalDate.substring(4, 6), 10) - 1;
            const day = parseInt(originalDate.substring(6, 8), 10);
            dateObj = new Date(year, month, day);
          } else if (originalDate.length === 6) {
            const year = 2000 + parseInt(originalDate.substring(0, 2), 10);
            const month = parseInt(originalDate.substring(2, 4), 10) - 1;
            const day = parseInt(originalDate.substring(4, 6), 10);
            dateObj = new Date(year, month, day);
          }
  
          if (dateObj && !isNaN(dateObj.getTime())) {
            dateObj.setDate(dateObj.getDate() + daysToAdd);
            let newDate;
            if (originalDate.length === 8) {
              newDate =
                dateObj.getFullYear().toString() +
                (dateObj.getMonth() + 1).toString().padStart(2, '0') +
                dateObj.getDate().toString().padStart(2, '0');
            } else {
              newDate =
                (dateObj.getFullYear() % 100).toString().padStart(2, '0') +
                (dateObj.getMonth() + 1).toString().padStart(2, '0') +
                dateObj.getDate().toString().padStart(2, '0');
            }
            parts[2] = newDate;
          }
        }
        return EndsTilde(parts.join('*'));
      });
  
      newProcessedContents[fileName] = isSingleLine ? updatedLines.join('') : updatedLines.join('\n');
    });
  
    setProcessedFileContents(newProcessedContents);
  };

  const incrementCounter = () => {
    if (processingMode === 'bulk') return; // Prevent counter changes in bulk mode
    setCounter((prev) => prev + 1);

    const updatedDtmData = dtmData.map((dtm) => {
      const originalDate = dtm.original_date || dtm.date;
      if (!originalDate) return dtm;

      let dateObj;
      if (originalDate.length === 8) {
        const year = parseInt(originalDate.substring(0, 4), 10);
        const month = parseInt(originalDate.substring(4, 6), 10) - 1;
        const day = parseInt(originalDate.substring(6, 8), 10);
        dateObj = new Date(year, month, day);
      } else if (originalDate.length === 6) {
        const year = 2000 + parseInt(originalDate.substring(0, 2), 10);
        const month = parseInt(originalDate.substring(2, 4), 10) - 1;
        const day = parseInt(originalDate.substring(4, 6), 10);
        dateObj = new Date(year, month, day);
      } else {
        return dtm;
      }

      if (!isNaN(dateObj.getTime())) {
        dateObj.setDate(dateObj.getDate() + (counter + 1));
        let newDate;
        if (originalDate.length === 8) {
          newDate =
            dateObj.getFullYear().toString() +
            (dateObj.getMonth() + 1).toString().padStart(2, '0') +
            dateObj.getDate().toString().padStart(2, '0');
        } else {
          newDate =
            (dateObj.getFullYear() % 100).toString().padStart(2, '0') +
            (dateObj.getMonth() + 1).toString().padStart(2, '0') +
            dateObj.getDate().toString().padStart(2, '0');
        }
        return { ...dtm, date: newDate };
      }
      return dtm;
    });

    setDtmData(updatedDtmData);
  };

  const decrementCounter = () => {
    if (processingMode === 'bulk') return; // Prevent counter changes in bulk mode
    setCounter((prev) => prev - 1);

    const updatedDtmData = dtmData.map((dtm) => {
      const originalDate = dtm.original_date || dtm.date;
      if (!originalDate) return dtm;

      let dateObj;
      if (originalDate.length === 8) {
        const year = parseInt(originalDate.substring(0, 4), 10);
        const month = parseInt(originalDate.substring(4, 6), 10) - 1;
        const day = parseInt(originalDate.substring(6, 8), 10);
        dateObj = new Date(year, month, day);
      } else if (originalDate.length === 6) {
        const year = 2000 + parseInt(originalDate.substring(0, 2), 10);
        const month = parseInt(originalDate.substring(2, 4), 10) - 1;
        const day = parseInt(originalDate.substring(4, 6), 10);
        dateObj = new Date(year, month, day);
      } else {
        return dtm;
      }

      if (!isNaN(dateObj.getTime())) {
        dateObj.setDate(dateObj.getDate() + (counter - 1));
        let newDate;
        if (originalDate.length === 8) {
          newDate =
            dateObj.getFullYear().toString() +
            (dateObj.getMonth() + 1).toString().padStart(2, '0') +
            dateObj.getDate().toString().padStart(2, '0');
        } else {
          newDate =
            (dateObj.getFullYear() % 100).toString().padStart(2, '0') +
            (dateObj.getMonth() + 1).toString().padStart(2, '0') +
            dateObj.getDate().toString().padStart(2, '0');
        }
        return { ...dtm, date: newDate };
      }
      return dtm;
    });

    setDtmData(updatedDtmData);
  };

  const handleGenerateFiles = (e: React.FormEvent) => {
    e.preventDefault();

    // Check if there are selected PO1 lines that haven't been saved
    if (isPo1SelectionPendingSave && po1Data.some((po1) => po1.include)) {
      toast.error('Please save your selected PO1 lines before generating files.', {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      return;
    }

    setIsProcessing(true);
    console.log('Form submitted, generating files with po1Data:', po1Data);
  
    if (processingMode === 'bulk' && uploadedFiles.length > 0) {
      const updatedFilesList: { name: string; content: string }[] = [];

      uploadedFiles.forEach((file, index) => {
        const content = processedFileContents[file.name] || '';
        if (!content) {
          console.warn(`No content found for file: ${file.name}`);
          return;
        }
  
        const result = processFile(content);
        const isSingleLine = result.isSingleLine;
        const lines = isSingleLine
          ? content.split(/~/).map((s) => s.trim()).filter(Boolean)
          : content.split(/\r?\n/).map((s) => s.trim().replace(/~$/, '')).filter(Boolean);
  
        let updatedLines: string[] = [];
        let segmentCount = 0;
        let inTransactionSet = false;
        let po1Count = 0;
        const controlNumber = generateControlNumber(index);
  
        lines.forEach((line) => {
          const trimmedLine = line.trim().replace(/~$/, '');
          if (!trimmedLine) return;
  
          const parts = trimmedLine.split('*');
  
          if (parts[0] === 'ST') {
            inTransactionSet = true;
            segmentCount = 1;
            parts[2] = controlNumber;
            updatedLines.push(EndsTilde(parts.join('*')));
          } else if (parts[0] === 'PO1') {
            po1Count++;
            updatedLines.push(EndsTilde(parts.join('*')));
            segmentCount++;
          } else if (['PO4', 'AMT'].includes(parts[0])) {
            updatedLines.push(EndsTilde(parts.join('*')));
            segmentCount++;
          } else if (parts[0] === 'ISA') {
            parts[5] = formDataISA.sender_id_qualifier || parts[5]?.trim() || 'ZZ';
            parts[6] = formDataISA.sender_id
              ? formDataISA.sender_id.padEnd(15, ' ').slice(0, 15)
              : (parts[6]?.trim() || '').padEnd(15, ' ').slice(0, 15);
            parts[7] = formDataISA.receiver_id_qualifier || parts[7]?.trim() || 'ZZ';
            parts[8] = formDataISA.receiver_id
              ? formDataISA.receiver_id.padEnd(15, ' ').slice(0, 15) : (parts[8]?.trim() || '').padEnd(15, ' ').slice(0, 15);
            parts[13] = controlNumber;
            updatedLines.push(EndsTilde(parts.join('*')));
          } else if (parts[0] === 'GS') {
            parts[2] = formDataGS.sender_id || parts[2]?.trim() || '';
            parts[3] = formDataGS.receiver_id || parts[3]?.trim() || '';
            parts[6] = controlNumber;
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet) segmentCount++;
          } else if (parts[0] === 'BEG') {
            if (formDataGS.purchase_order_number) {
              parts[3] = formDataGS.purchase_order_number + `T${index + 1}`;
            } else {
              parts[3] = parts[3]?.trim() || '';
            }
            parts[5] = formDataGS.purchase_date || parts[5]?.trim() || '';
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet) segmentCount++;
          } else if (parts[0] === 'DTM') {
            const originalQualifier = parts[1];
            const matchingDtm = dtmData.find(
              (dtm) => dtm.original_qualifier_id === originalQualifier && dtm.segment_type === 'DTM'
            );
            if (matchingDtm) {
              parts[1] = matchingDtm.qualifier_id || originalQualifier;
              parts[2] = matchingDtm.date;
            }
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet) segmentCount++;
          } else if (parts[0] === 'G62') {
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet) segmentCount++;
          } else if (parts[0] === 'CTT') {
            parts[1] = String(po1Count);
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet) segmentCount++;
          } else if (parts[0] === 'SE') {
            segmentCount++;
            parts[1] = String(segmentCount);
            parts[2] = controlNumber;
            updatedLines.push(EndsTilde(parts.join('*')));
          } else {
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet && parts[0] !== 'SE') segmentCount++;
          }
        });
  
        const updatedContent = isSingleLine ? updatedLines.join('') : updatedLines.join('\n');
        const formattedDateTime = getFormattedDateTime();
        const fileExtension = file.name.substring(file.name.lastIndexOf('.')) || '.txt';
        const updatedFileName = `${file.name.replace(/\.[^/.]+$/, '')}_updated_${formattedDateTime}${fileExtension}`;
  
        updatedFilesList.push({ name: updatedFileName, content: updatedContent });
  
        const blob = new Blob([updatedContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = updatedFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  
      setUpdatedFiles(updatedFilesList);
      setGeneratedContent('');
    } else if (uploadedFiles.length > 0) {
      const content = processedFileContents[uploadedFiles[0].name] || '';
      if (!content) {
        console.warn(`No content found for file: ${uploadedFiles[0].name}`);
        setIsProcessing(false);
        return;
      }
  
      const isSingleLine = !content.includes('\n');
      const lines = isSingleLine
        ? content.split(/~/).map((s) => s.trim()).filter(Boolean)
        : content.split(/\r?\n/).map((s) => s.trim().replace(/~$/, '')).filter(Boolean);
  
      let updatedLines: string[] = [];
      let po1Index = 0;
      let skipUntilNextPO1 = false;
      let segmentCount = 0;
      let inTransactionSet = false;
      const anyPo1Selected = po1Data.some((po1) => po1.include);
      const includedPo1Count = anyPo1Selected ? po1Data.filter((po1) => po1.include).length : po1Data.length;
      const controlNumber = generateControlNumber(0);
  
      lines.forEach((line) => {
        const trimmedLine = line.trim().replace(/~$/, '');
        if (!trimmedLine) return;
  
        const parts = trimmedLine.split('*');
  
        if (parts[0] === 'ST') {
          inTransactionSet = true;
          segmentCount = 1;
          parts[2] = controlNumber;
          updatedLines.push(EndsTilde(parts.join('*')));
        } else if (parts[0] === 'PO1') {
          if (po1Index < po1Data.length) {
            if (!anyPo1Selected) {
              updatedLines.push(EndsTilde(trimmedLine));
              segmentCount++;
              po1Data[po1Index].dependentSegments.forEach((segment) => {
                updatedLines.push(EndsTilde(segment));
                segmentCount++;
              });
              skipUntilNextPO1 = false;
            } else if (po1Data[po1Index].include) {
              updatedLines.push(EndsTilde(po1Data[po1Index].line));
              segmentCount++;
              po1Data[po1Index].dependentSegments.forEach((segment) => {
                updatedLines.push(EndsTilde(segment));
                segmentCount++;
              });
              skipUntilNextPO1 = false;
            } else {
              skipUntilNextPO1 = true;
            }
          }
          po1Index++;
        } else if (!skipUntilNextPO1 || ['CTT', 'SE', 'GE', 'IEA'].includes(parts[0])) {
          if (!['PO4', 'AMT'].includes(parts[0])) {
            if (parts[0] === 'ISA') {
              parts[5] = formDataISA.sender_id_qualifier || parts[5]?.trim() || 'ZZ';
              parts[6] = formDataISA.sender_id
                ? formDataISA.sender_id.padEnd(15, ' ').slice(0, 15)
                : (parts[6]?.trim() || '').padEnd(15, ' ').slice(0, 15);
              parts[7] = formDataISA.receiver_id_qualifier || parts[7]?.trim() || 'ZZ';
              parts[8] = formDataISA.receiver_id
                ? formDataISA.receiver_id.padEnd(15, ' ').slice(0, 15)
                : (parts[8]?.trim() || '').padEnd(15, ' ').slice(0, 15);
              parts[13] = controlNumber;
            } else if (parts[0] === 'GS') {
              parts[2] = formDataGS.sender_id || parts[2]?.trim() || '';
              parts[3] = formDataGS.receiver_id || parts[3]?.trim() || '';
              parts[6] = controlNumber;
            } else if (parts[0] === 'BEG') {
              parts[3] = formDataGS.purchase_order_number || parts[3]?.trim() || '';
              parts[5] = formDataGS.purchase_date || parts[5]?.trim() || '';
            } else if (parts[0] === 'DTM') {
              const originalQualifier = parts[1];
              const matchingDtm = dtmData.find(
                (dtm) => dtm.original_qualifier_id === originalQualifier && dtm.segment_type === 'DTM'
              );
              if (matchingDtm) {
                parts[1] = matchingDtm.qualifier_id || originalQualifier;
                parts[2] = matchingDtm.date;
              }
            } else if (parts[0] === 'G62') {
              const originalQualifier = parts[1];
              const originalDate = parts[2];
              const matchingDtm = dtmData.find(
                (dtm) => dtm.original_qualifier_id === originalQualifier && dtm.segment_type === 'G62' && dtm.original_date === originalDate
              );
              if (matchingDtm) {
                parts[1] = matchingDtm.qualifier_id || originalQualifier;
                parts[2] = matchingDtm.date;
              }
            } else if (parts[0] === 'CTT') {
              parts[1] = String(includedPo1Count);
            } else if (parts[0] === 'SE') {
              segmentCount++;
              parts[1] = String(segmentCount);
              parts[2] = controlNumber;
            }
            updatedLines.push(EndsTilde(parts.join('*')));
            if (inTransactionSet && parts[0] !== 'SE') {
              segmentCount++;
            }
          }
        }
      });
  
      const updatedContent = isSingleLine ? updatedLines.join('') : updatedLines.join('\n');
      setGeneratedContent(updatedContent);
  
      const formattedDateTime = getFormattedDateTime();
      const fileExtension = uploadedFiles[0].name.substring(uploadedFiles[0].name.lastIndexOf('.')) || '.txt';
      const updatedFileName = `edi_update_${formattedDateTime}${fileExtension}`;
  
      const blob = new Blob([updatedContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = updatedFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  
      setUpdatedFiles([{ name: updatedFileName, content: updatedContent }]);
    } else {
      toast.error('No files uploaded to process.', {
        position: 'top-right',
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      setIsProcessing(false);
      return;
    }
  
    setIsProcessing(false);
  };

  const downloadUpdatedFile = (fileName: string, content: string) => {
    console.log('Downloading file:', fileName);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="form-containers">
      <nav className="nav-bar">
        <img src='/logo.png' alt="Kenvue Logo" />
      </nav>

      <h1>EDI FILE GENERATOR</h1>

      <div className="content-container">
        <div className="form-section">
          <form onSubmit={handleGenerateFiles}>
            <div className="para">
              <h4>Select Files:</h4>
              <input type="file" accept=".txt,.edi" onChange={handleFileUpload} className="upload-btn" multiple />
              {uploadedFiles.length > 0 && (
                <div className="file-info">
                  {uploadedFiles.length} file(s) selected
                  {transactionSetNumbers.length > 0 && (
                    <span className="transaction-numbers">
                      <p className='file-info'>Type: {Array.from(new Set(transactionSetNumbers)).join(', ')} TX</p>
                    </span>
                  )} 
                  {processingMode === 'bulk' && <span className="bulk-mode">(Bulk mode)</span>}
                </div>
              )}
            </div>

            <div className="form-group">
              <h4>ISA Transaction</h4>
            </div>

            <div className="row-container">
              <input
                type="text"
                id="sender_id_qualifier"
                placeholder="Sender ID Qualifier"
                value={formDataISA.sender_id_qualifier}
                onChange={handleChangeISA}
                maxLength={2}
              />
              <input type="text" id="sender_id" placeholder="Sender ID" value={formDataISA.sender_id} onChange={handleChangeISA} maxLength={15} />
            </div>

            <div className="row-container">
              <input
                type="text"
                id="receiver_id_qualifier"
                placeholder="Receiver ID Qualifier"
                value={formDataISA.receiver_id_qualifier}
                onChange={handleChangeISA}
                maxLength={2}
              />
              <input type="text" id="receiver_id" placeholder="Receiver ID" value={formDataISA.receiver_id} onChange={handleChangeISA} maxLength={15} />
            </div>

            <div className="form-group">
              <h4>GS Transaction</h4>
            </div>

            <div className="row-container">
              <input type="text" id="sender_id" placeholder="Sender ID" value={formDataGS.sender_id} onChange={handleChangeGS} maxLength={15} />
              <input type="text" id="receiver_id" placeholder="Receiver ID" value={formDataGS.receiver_id} onChange={handleChangeGS} maxLength={15} />
            </div>

            <div className="form-group">
              <label htmlFor="purchase_order_number" className="color">
                <h4>PO Number:</h4>
              </label>
              <input
                type="text"
                id="purchase_order_number"
                placeholder="Purchase Order Number"
                value={formDataGS.purchase_order_number}
                onChange={handleChangeGS}
                maxLength={22}
              />
            </div>

            <div className="form-group">
              <label htmlFor="purchase_date" className="color">
                <h4>PO Date:</h4>
              </label>
              <input
                type="text"
                id="purchase_date"
                placeholder="Purchase Date (yymmdd)"
                value={formDataGS.purchase_date}
                onChange={handleChangeGS}
                maxLength={8}
              />
            </div>

            <div className="po1-editor-wrapper">
              {po1Data.length > 0 && (
                <PO1Editor
                  po1Data={po1Data}
                  onPO1Change={handlePO1Change}
                  onIncludeChange={handlePO1IncludeChange}
                  onSelectionPendingSaveChange={setIsPo1SelectionPendingSave}
                />
              )}
            </div>

            <div className={`dtm-container dtm-section ${processingMode === 'bulk' ? 'disabled' : ''}`}>
              <div className="form-group">
                <div className="right">
                  <h4>
                    {transactionSetNumbers.includes('850') && transactionSetNumbers.includes('875')
                      ? 'DTM/G62'
                      : transactionSetNumbers.includes('875')
                      ? 'G62'
                      : 'DTM'}
                  </h4>
                  <button
                    type="button"
                    className="btne"
                    onClick={decrementCounter}
                    disabled={processingMode === 'bulk'}
                  >
                    <strong>-</strong>
                  </button>
                  <span className="number">{counter}</span>
                  <button
                    type="button"
                    className="btns"
                    onClick={incrementCounter}
                    disabled={processingMode === 'bulk'}
                  >
                    <strong>+</strong>
                  </button>
                </div>
              </div>

              {dtmData.map((dtm, index) => (
                <div key={index} className="row-container">
                  <input
                    type="text"
                    placeholder="Qualifier ID"
                    value={dtm.qualifier_id}
                    onChange={(e) => {
                      if (processingMode === 'bulk') return; // Prevent changes in bulk mode
                      const newDtmData = [...dtmData];
                      newDtmData[index].qualifier_id = e.target.value;
                      setDtmData(newDtmData);
                    }}
                    maxLength={3}
                    disabled={processingMode === 'bulk'}
                  />
                  <input
                    type="text"
                    value={dtm.date}
                    onChange={(e) => {
                      if (processingMode === 'bulk') return; // Prevent changes in bulk mode
                      const newDtmData = [...dtmData];
                      newDtmData[index].date = e.target.value;
                      setDtmData(newDtmData);
                    }}
                    disabled={processingMode === 'bulk'}
                  />
                </div>
              ))}
            </div>

            <button type="submit" className="buttongen" disabled={isProcessing}>
              {isProcessing ? 'Processing...' : processingMode === 'bulk' ? 'Process Files' : 'Generate'}
            </button>
          </form>
        </div>
        <div className="container">
          <div className="output-section">
            <h3>Generated EDI Output</h3>
            <pre>{generatedContent || 'No content generated yet'}</pre>
          </div>

          <div className="updated-files-section">
            <h4>Updated Files:</h4>
            {updatedFiles.length > 0 ? (
              <ul className="files-list">
                {updatedFiles.map((file, index) => (
                  <li key={index} className="file-item">
                    <FileText className="file-icon" />
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        downloadUpdatedFile(file.name, file.content);
                      }}
                    >
                      {file.name}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="no-files">No files have been processed yet</div>
            )}
          </div>
        </div>
      </div>
      <ToastContainer />
    </div>
  );
}

export default App;