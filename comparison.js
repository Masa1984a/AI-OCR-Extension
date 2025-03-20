// comparison.js
// DOM Elements
const originalImage = document.getElementById('originalImage');
const cropOverlay = document.getElementById('cropOverlay');
const hiddenCanvas = document.getElementById('hiddenCanvas');

// Form fields
const payeeNameInput = document.getElementById('payeeName');
const issueDateInput = document.getElementById('issueDate');
const amountInput = document.getElementById('amountIncludingTax');
const currencyInput = document.getElementById('currency');
const registrationInput = document.getElementById('registrationNumber');
const notesInput = document.getElementById('notes');

// Debug display
const debugJson = document.getElementById('debugJson');

// Buttons
const backBtn = document.getElementById('backBtn');
const saveImageBtn = document.getElementById('saveImageBtn');
const saveJsonBtn = document.getElementById('saveJsonBtn');

// Store the OCR data
let ocrData = null;
let imageScale = 1;
let originalOcrText = ''; // Store the original OCR text
let originalImageWidth = 0; // Original image width from OCR data
let originalImageHeight = 0; // Original image height from OCR data

// Function to recalculate image scaling factors
function recalculateImageScaling() {
  if (!originalImage) return;
  
  // Get current dimensions of the displayed image
  const displayedWidth = originalImage.clientWidth;
  const displayedHeight = originalImage.clientHeight;
  const naturalWidth = originalImage.naturalWidth;
  const naturalHeight = originalImage.naturalHeight;
  
  console.log(`Image dimensions updated - Natural: ${naturalWidth}x${naturalHeight}, Displayed: ${displayedWidth}x${displayedHeight}`);
  
  // If any overlay is currently visible, update its position by calling showCropOverlay again
  if (cropOverlay.style.display === 'block') {
    // Try to determine which field is currently active
    const activeFields = ['payeeName', 'issueDate', 'amountIncludingTax',
                         'currency', 'registrationNumber', 'notes'];
    
    // First, try to find which form field has focus
    const focusedElement = document.activeElement;
    let activeFieldName = null;
    
    if (focusedElement) {
      for (const fieldName of activeFields) {
        if (focusedElement.id === fieldName) {
          activeFieldName = fieldName;
          break;
        }
      }
    }
    
    // If no field has focus, try to determine by checking the overlay position
    if (!activeFieldName) {
      for (const fieldName of activeFields) {
        if (ocrData && ocrData[fieldName] &&
            ocrData[fieldName].width > 0 && ocrData[fieldName].height > 0) {
          showCropOverlay(fieldName);
          return; // Only update one field
        }
      }
    } else {
      // Update the active field's overlay
      showCropOverlay(activeFieldName);
    }
  }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
  // Get data passed from popup
  chrome.storage.local.get(['ocrResults', 'capturedImageData', 'usedAiModel'], (data) => {
    if (data.capturedImageData) {
      originalImage.src = data.capturedImageData;
      
      // Wait for image to load to set up scaling
      originalImage.onload = () => {
        // Calculate image scaling factors (actual displayed size vs original size)
        recalculateImageScaling();
        
        // Now that we have the scaling factors, we can display any highlights
        setupFormHighlighting();
        
        // Add resize event listener to handle window resizing
        window.addEventListener('resize', () => {
          recalculateImageScaling();
        });
      };
    } else {
      console.error('No image data found');
    }
    
    // 使用したAIモデルの情報を表示に追加
    if (data.usedAiModel) {
      let modelName;
      switch (data.usedAiModel) {
        case 'gemini':
          modelName = 'Gemini 2.0 Flash';
          break;
        case 'claude':
          modelName = 'Claude 3.7 Sonnet';
          break;
        case 'chatgpt':
          modelName = 'ChatGPT-4o';
          break;
        default:
          modelName = data.usedAiModel;
      }
      
      // タイトルにモデル名を追加
      const titleElement = document.querySelector('h1');
      if (titleElement) {
        titleElement.textContent = `OCR結果確認 (${modelName})`;
      }
    }
    
    if (data.ocrResults) {
      try {
        // Store original OCR text for debugging
        originalOcrText = data.ocrResults;
        
        // Display raw JSON in debug textarea
        debugJson.value = originalOcrText;
        
        // Try to parse as JSON
        try {
          ocrData = JSON.parse(data.ocrResults);
        } catch (e) {
          // If it's not JSON directly, look for JSON in the string
          // This handles the case where API might return extra text around the JSON
          const jsonMatch = data.ocrResults.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            ocrData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No valid JSON found in the response');
          }
        }
        
        // Extract image dimensions from OCR data if available
        if (ocrData.imageWidthPx && ocrData.imageHeightPx) {
          originalImageWidth = ocrData.imageWidthPx;
          originalImageHeight = ocrData.imageHeightPx;
          console.log(`Original image dimensions from OCR: ${originalImageWidth}x${originalImageHeight}`);
        }
        
        populateFormFields(ocrData);
      } catch (error) {
        console.error('Failed to parse OCR results:', error);
        // Display error message to user
        alert('OCR結果の解析に失敗しました。正しいJSON形式でない可能性があります。');
      }
    } else {
      console.error('No OCR results found');
    }
  });
});

// Populate form fields with OCR data
function populateFormFields(data) {
  if (!data) return;
  
  if (data.payeeName) {
    payeeNameInput.value = data.payeeName.value || '';
  }
  
  if (data.issueDate) {
    issueDateInput.value = data.issueDate.value || '';
  }
  
  if (data.amountIncludingTax) {
    amountInput.value = data.amountIncludingTax.value || '';
  }
  
  if (data.currency) {
    currencyInput.value = data.currency.value || '';
  }
  
  if (data.registrationNumber) {
    registrationInput.value = data.registrationNumber.value || '';
  }
  
  if (data.notes) {
    notesInput.value = data.notes.value || '';
  }
}

// Set up form field events to show crop highlights
function setupFormHighlighting() {
  const formFieldMap = {
    'payeeName': payeeNameInput,
    'issueDate': issueDateInput,
    'amountIncludingTax': amountInput,
    'currency': currencyInput,
    'registrationNumber': registrationInput,
    'notes': notesInput
  };
  
  // Add event listeners to all form fields
  for (const [key, element] of Object.entries(formFieldMap)) {
    element.addEventListener('focus', () => {
      showCropOverlay(key);
    });
    
    element.addEventListener('blur', () => {
      hideCropOverlay();
    });
  }
}

// Show crop overlay for a specific field
function showCropOverlay(fieldName) {
  if (!ocrData || !ocrData[fieldName]) return;
  
  // Skip fields with zero dimensions (like N/A fields)
  const field = ocrData[fieldName];
  if (field.width === 0 || field.height === 0) {
    console.log(`Skipping overlay for ${fieldName} - has zero dimensions`);
    return;
  }
  
  // Get the image dimensions
  const displayedWidth = originalImage.clientWidth;
  const displayedHeight = originalImage.clientHeight;
  
  console.log(`Displayed image dimensions: ${displayedWidth}x${displayedHeight}`);
  console.log(`OCR dimensions: ${originalImageWidth}x${originalImageHeight}`);
  
  // ===== SIMPLIFIED RELATIVE POSITIONING APPROACH =====
  // Calculate the scaling ratio between OCR dimensions and displayed dimensions
  let scaleX, scaleY;
  
  if (originalImageWidth > 0 && originalImageHeight > 0) {
    // Calculate the aspect ratios
    const ocrAspectRatio = originalImageWidth / originalImageHeight;
    const displayedAspectRatio = displayedWidth / displayedHeight;
    
    // Determine how scaling should be applied based on which dimension constrains the image
    if (Math.abs(ocrAspectRatio - displayedAspectRatio) < 0.01) {
      // Aspect ratios are virtually the same - simple scaling
      scaleX = displayedWidth / originalImageWidth;
      scaleY = displayedHeight / originalImageHeight;
    } else if (ocrAspectRatio > displayedAspectRatio) {
      // Width is the constraining dimension
      scaleX = displayedWidth / originalImageWidth;
      scaleY = scaleX; // Preserve aspect ratio
    } else {
      // Height is the constraining dimension
      scaleY = displayedHeight / originalImageHeight;
      scaleX = scaleY; // Preserve aspect ratio
    }
  } else {
    // Fallback if OCR dimensions aren't available
    const naturalWidth = originalImage.naturalWidth;
    const naturalHeight = originalImage.naturalHeight;
    scaleX = displayedWidth / naturalWidth;
    scaleY = displayedHeight / naturalHeight;
  }
  
  // Calculate the positions - scaled directly from OCR coordinates
  let x = Math.round(field.x * scaleX);
  let y = Math.round(field.y * scaleY);
  let width = Math.round(field.width * scaleX);
  let height = Math.round(field.height * scaleY);
  
  // Ensure minimum size for visibility
  if (width < 10) width = 10;
  if (height < 10) height = 10;
  
  // Position overlay directly using container-relative coordinates
  // No need for getBoundingClientRect or offsets - the container is the reference
  cropOverlay.style.left = `${x}px`;
  cropOverlay.style.top = `${y}px`;
  cropOverlay.style.width = `${width}px`;
  cropOverlay.style.height = `${height}px`;
  cropOverlay.style.display = 'block';
  
  // Debug logging
  console.log(`Field: ${fieldName}`);
  console.log(`OCR field data: x:${field.x}, y:${field.y}, w:${field.width}, h:${field.height}`);
  console.log(`Scaling factors: scaleX:${scaleX.toFixed(4)}, scaleY:${scaleY.toFixed(4)}`);
  console.log(`Final overlay position: left:${x}px, top:${y}px, width:${width}px, height:${height}px`);
}

// Hide crop overlay
function hideCropOverlay() {
  cropOverlay.style.display = 'none';
}

// Update OCR data with form values
function updateOcrData() {
  if (!ocrData) {
    ocrData = {};
  }
  
  // Preserve original image dimensions if they exist
  if (originalImageWidth > 0 && originalImageHeight > 0) {
    ocrData.imageWidthPx = originalImageWidth;
    ocrData.imageHeightPx = originalImageHeight;
  }
  
  // Only update values, not coordinates
  if (ocrData.payeeName) {
    ocrData.payeeName.value = payeeNameInput.value;
  } else if (payeeNameInput.value) {
    ocrData.payeeName = { value: payeeNameInput.value };
  }
  
  if (ocrData.issueDate) {
    ocrData.issueDate.value = issueDateInput.value;
  } else if (issueDateInput.value) {
    ocrData.issueDate = { value: issueDateInput.value };
  }
  
  if (ocrData.amountIncludingTax) {
    ocrData.amountIncludingTax.value = amountInput.value;
  } else if (amountInput.value) {
    ocrData.amountIncludingTax = { value: amountInput.value };
  }
  
  if (ocrData.currency) {
    ocrData.currency.value = currencyInput.value;
  } else if (currencyInput.value) {
    ocrData.currency = { value: currencyInput.value };
  }
  
  if (ocrData.registrationNumber) {
    ocrData.registrationNumber.value = registrationInput.value;
  } else if (registrationInput.value) {
    ocrData.registrationNumber = { value: registrationInput.value };
  }
  
  if (ocrData.notes) {
    ocrData.notes.value = notesInput.value;
  } else if (notesInput.value) {
    ocrData.notes = { value: notesInput.value };
  }
  
  return ocrData;
}

// Create formatted JSON output
function createFormattedJSON() {
  const updatedData = updateOcrData();
  
  // Create a simplified JSON structure with just the values
  const simplifiedData = {
    imageWidthPx: updatedData.imageWidthPx,
    imageHeightPx: updatedData.imageHeightPx,
    payeeName: updatedData.payeeName?.value || '',
    issueDate: updatedData.issueDate?.value || '',
    amountIncludingTax: updatedData.amountIncludingTax?.value || '',
    currency: updatedData.currency?.value || '',
    registrationNumber: updatedData.registrationNumber?.value || '',
    notes: updatedData.notes?.value || ''
  };
  
  // Return formatted JSON string
  return JSON.stringify(simplifiedData, null, 2);
}

// Save image button handler
saveImageBtn.addEventListener('click', () => {
  if (!originalImage.src) {
    alert('画像が読み込まれていません。');
    return;
  }
  
  try {
    // Create a temporary canvas to get the image data
    const ctx = hiddenCanvas.getContext('2d');
    hiddenCanvas.width = originalImage.naturalWidth;
    hiddenCanvas.height = originalImage.naturalHeight;
    ctx.drawImage(originalImage, 0, 0);
    
    const dataUrl = hiddenCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    
    // Create filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    a.download = `receipt_${timestamp}.png`;
    a.click();
  } catch (error) {
    console.error('画像保存エラー:', error);
    alert('画像の保存中にエラーが発生しました');
  }
});

// Save JSON button handler
saveJsonBtn.addEventListener('click', () => {
  try {
    const jsonContent = createFormattedJSON();
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Create filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    a.download = `ocr_result_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('JSON保存エラー:', error);
    alert('JSONの保存中にエラーが発生しました');
  }
});

// Back button handler
backBtn.addEventListener('click', () => {
  // Save any edited data before going back
  const updatedData = updateOcrData();
  chrome.storage.local.set({
    'ocrResults': JSON.stringify(updatedData),
    'preserveImageOnReturn': true // Flag to preserve the image when returning to popup.html
  });
  
  // Navigate back to the camera screen (popup.html)
  window.location.href = 'popup.html';
});