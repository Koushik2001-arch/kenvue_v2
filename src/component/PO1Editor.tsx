import React, { useState, useRef, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './po1.css';

interface PO1Data {
  line: string;
  include: boolean;
  dependentSegments: string[];
}

interface PO1EditorProps {
  po1Data: PO1Data[];
  onPO1Change: (index: number, value: string) => void;
  onIncludeChange: (index: number, include: boolean) => void;
  onSelectionPendingSaveChange: (isPending: boolean) => void;
}

const PO1Editor: React.FC<PO1EditorProps> = ({ po1Data, onPO1Change, onIncludeChange, onSelectionPendingSaveChange }) => {
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editedLines, setEditedLines] = useState<string[]>(po1Data.map(po1 => po1.line));
  const selectRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLDivElement>(null);

  // console.log('PO1Editor rendered with po1Data:', po1Data);
  // console.log('isSelectOpen:', isSelectOpen);
  // console.log('isEditOpen:', isEditOpen);

  const toggleSelect = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsSelectOpen(prev => {
      // console.log('Select PO1 Lines button clicked, toggling isSelectOpen to:', !prev);
      return !prev;
    });
  };

  const toggleEdit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsEditOpen(prev => {
      // console.log('Edit Selected PO1 Lines button clicked, toggling isEditOpen to:', !prev);
      return !prev;
    });
  };

  useEffect(() => {
    const dtmSection = document.querySelector('.dtm-section') as HTMLElement;
    const selectBox = document.querySelector('.po1-editor-box') as HTMLElement;
    const editBox = document.querySelector('.po1-edit-box') as HTMLElement;

    if (isSelectOpen && selectBox && dtmSection) {
      const selectHeight = selectBox.offsetHeight;
      dtmSection.style.marginTop = `${selectHeight + 20}px`;
      dtmSection.classList.add('dtm-shifted');
    } else if (isEditOpen && editBox && dtmSection) {
      const editHeight = editBox.offsetHeight;
      dtmSection.style.marginTop = `${editHeight + 20}px`;
      dtmSection.classList.add('dtm-shifted');
    } else if (dtmSection) {
      dtmSection.style.marginTop = '0';
      dtmSection.classList.remove('dtm-shifted');
    }
  }, [isSelectOpen, isEditOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        // console.log('Clicked outside select dropdown, closing');
        setIsSelectOpen(false);
      }
      if (editRef.current && !editRef.current.contains(event.target as Node)) {
        // console.log('Clicked outside edit dropdown, closing');
        setIsEditOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    // console.log('Save button clicked, saving edited lines:', editedLines);
    po1Data.forEach((po1, index) => {
      if (po1.include) {
        onPO1Change(index, editedLines[index]);
      }
    });
    setIsEditOpen(false);
    onSelectionPendingSaveChange(false); // Mark selections as saved
    toast.success('Saved Successfully', {
      position: 'top-right',
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  };

  const handleLineChange = (index: number, value: string) => {
    // console.log(`Editing PO1 line at index ${index}:`, value);
    setEditedLines(prev => {
      const newLines = [...prev];
      newLines[index] = value;
      return newLines;
    });
  };

  const handleCheckboxChange = (index: number, checked: boolean) => {
    // console.log(`Checkbox at index ${index} changed to:`, checked);
    onIncludeChange(index, checked);
    // If any PO1 line is selected, mark as pending save
    if (checked) {
      onSelectionPendingSaveChange(true);
    } else {
      // If no PO1 lines are selected, clear pending save
      const anySelected = po1Data.some((po1, i) => (i === index ? checked : po1.include));
      onSelectionPendingSaveChange(anySelected);
    }
  };

  const selectedPo1Count = po1Data.filter(po1 => po1.include).length;

  return (
    <div className="po1-editor-container">
      <h4>Purchase Order Line Item is selected in...</h4>
      <div ref={selectRef} className="po1-button-container">
        <button
          type="button"
          className="po1-select-button"
          onClick={toggleSelect}
        >
          Select PO1 Lines ({po1Data.length})
        </button>

        {isSelectOpen && (
          <div className="po1-editor-box">
            {po1Data.length === 0 ? (
              <div className="po1-line">No PO1 lines available</div>
            ) : (
              po1Data.map((po1, index) => (
                <div key={index} className="po1-line">
                  <input
                    type="checkbox"
                    checked={po1.include}
                    onChange={(e) => handleCheckboxChange(index, e.target.checked)}
                    className="po1-checkbox"
                  />
                  <div className="po1-text-input">
                    <span className="po1-text">{po1.line}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedPo1Count > 0 && (
        <div ref={editRef} className="po1-button-container">
          <button
            type="button"
            className="po1-edit-button"
            onClick={toggleEdit}
          >
            Edit PO1 Lines ({selectedPo1Count})
          </button>
          {isEditOpen && (
            <div className={`po1-edit-box ${isEditOpen ? 'po1-edit-box--open' : ''}`}>
              {po1Data.map((po1, index) =>
                po1.include ? (
                  <div key={index} className="po1-line">
                    <div className="po1-text-input">
                      <input
                        type="text"
                        value={editedLines[index]}
                        onChange={(e) => handleLineChange(index, e.target.value)}
                        className="po1-input"
                        placeholder="Edit PO1 line..."
                      />
                    </div>
                  </div>
                ) : null
              )}
              <button type="button" className="save-button" onClick={handleSave}>
                Save
              </button>
            </div>
          )}
        </div>
      )}

      <ToastContainer />
    </div>
  );
};

export default PO1Editor;