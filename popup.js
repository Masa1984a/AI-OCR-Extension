// popup.js
let currentStream = null;

// 要素取得
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const attachBtn = document.getElementById('attachBtn');
const fileInput = document.getElementById('fileInput');
const ocrBtn = document.getElementById('ocrBtn');
const capturedImage = document.getElementById('capturedImage');
// 撮り直しボタン取得
const resetBtn = document.getElementById('resetBtn');

// カメラ起動関数（再利用するため関数化）
function startCamera() {
  // 既存のストリームがあれば停止
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  
  // カメラを起動
  return navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      currentStream = stream;
      video.srcObject = stream;
      video.style.display = 'block';
      
      // UI状態をリセット
      capturedImage.style.display = 'none';
      resetBtn.style.display = 'none';
      ocrBtn.disabled = true;
      
      return stream;
    })
    .catch(err => {
      console.error('Camera access error:', err);
      alert('カメラへのアクセスに失敗しました: ' + err.message);
    });
}

// 1. 初期化 - カメラ起動または画像の復元
chrome.storage.local.get(['preserveImageOnReturn', 'capturedImageData'], (data) => {
  if (data.preserveImageOnReturn && data.capturedImageData) {
    // 「戻る」ボタンから戻ってきた場合、画像を復元
    // 画像を表示
    capturedImage.src = data.capturedImageData;
    capturedImage.style.display = 'block';
    video.style.display = 'none';
    
    // キャンバスにも画像を描画する（OCR処理用）
    const img = new Image();
    img.onload = function() {
      // キャンバスのサイズを画像に合わせる
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, img.width, img.height);
    };
    img.src = data.capturedImageData;
    
    // ボタン状態を設定
    captureBtn.style.display = 'none'; // 「撮影」ボタンを非表示
    attachBtn.style.display = 'none'; // 「添付」ボタンも非表示
    resetBtn.style.display = 'block';
    ocrBtn.disabled = false;
    
    // フラグをリセット
    chrome.storage.local.remove('preserveImageOnReturn');
  } else {
    // 通常の初期化 - カメラ起動
    startCamera();
  }
});

// 2. 撮影(キャプチャ) → Canvasに描画 → 動画を非表示 + 画像プレビューを表示
captureBtn.addEventListener('click', () => {
  if (!video.srcObject) {
    alert('カメラが起動していません。');
    return;
  }
  
  // videoのサイズを取得しcanvasへ描画
  const width = video.videoWidth;
  const height = video.videoHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, width, height);
  
  // 撮影した画像をDataURLに変換してimgタグに表示
  const dataUrl = canvas.toDataURL('image/png');
  capturedImage.src = dataUrl;
  
  // カメラ映像を停止&非表示にする
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  video.style.display = 'none';
  video.srcObject = null;
  
  // 代わりに撮影画像表示
  capturedImage.style.display = 'block';
  
  // その他ボタン活性化
  ocrBtn.disabled = false;
  // 追加: 撮り直しボタン表示、撮影ボタンと添付ボタンを非表示
  resetBtn.style.display = 'block';
  captureBtn.style.display = 'none'; // 撮影ボタンを非表示に
  attachBtn.style.display = 'none'; // 添付ボタンも非表示に
});

// AIモデル選択の参照を取得
const aiModelSelect = document.getElementById('aiModel');

// 選択されたAIモデルを保存する
aiModelSelect.addEventListener('change', () => {
  chrome.storage.local.set({ selectedAiModel: aiModelSelect.value });
});

// 保存されたAIモデルの選択を復元する
chrome.storage.local.get('selectedAiModel', (data) => {
  if (data.selectedAiModel) {
    aiModelSelect.value = data.selectedAiModel;
  }
});

// プロンプトテキスト定義（どのモデルでも共通）
const getPromptText = () => {
  return `
  あなたは優秀な経理担当者です。受け取った領収書を画像解析して文字や金額を起こしてください。
## 重要事項
- わからない項目がある場合は、正直に「N/A」と記入してください。
- 1枚の画像に複数の領収書が含まれている場合は、それぞれの領収書ごとに別々のJSONを作成してください。
- 回答はJSONのみで出力してください。
- 標準的でない形式や追加情報がある場合は、各行の注記として記載してください。
- テキスト出力した根拠となる画像の場所について、クロップできるように、それぞれ座標(x,y)と幅、高さも教えてください。単位はpxでお願いします。

## 項目の説明
- 支払先会社名
- 発行日
- 支払金額税込
- 通貨
- 登録番号

## 出力形式
以下の項目をJSON形式で出力してください。

## 出力項目（優先順位順）
1. 支払先会社名
2. 発行日
3. 支払金額税込
4. 通貨
5. 登録番号
6. 注記

## JSONの定義
{
"$schema": "http://json-schema.org/draft-07/schema#",
"title": "InvoiceFields",
"type": "object",
"properties": {
  "imageWidthPx": {
    "type": "integer",
    "description": "撮影した画像の幅(px)"
  },
  "imageHeightPx": {
    "type": "integer",
    "description": "撮影した画像の高さ(px)"
  },
  "payeeName": {
    "type": "object",
    "title": "支払先会社名",
    "description": "支払先の会社名。宛名や請求先ではなく、実際に支払う先の会社名を示します。",
    "properties": {
      "value": {
        "type": "string",
        "description": "実際の文字列値（支払先会社名）"
      },
      "x": {
        "type": "number",
        "description": "座標X"
      },
      "y": {
        "type": "number",
        "description": "座標Y"
      },
      "width": {
        "type": "number",
        "description": "幅"
      },
      "height": {
        "type": "number",
        "description": "高さ"
      }
    },
    "required": ["value", "x", "y", "width", "height"]
  },
  "issueDate": {
    "type": "object",
    "title": "発行日",
    "description": "領収書を発行した日付（YYYY-MM-DD形式）",
    "properties": {
      "value": {
        "type": "string",
        "description": "実際の文字列値（発行日）",
        "pattern": "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|1\\d|2\\d|3[01])$",
        "example": "2025-03-15"
      },
      "x": {
        "type": "number",
        "description": "座標X"
      },
      "y": {
        "type": "number",
        "description": "座標Y"
      },
      "width": {
        "type": "number",
        "description": "幅"
      },
      "height": {
        "type": "number",
        "description": "高さ"
      }
    },
    "required": ["value", "x", "y", "width", "height"]
  },
  "amountIncludingTax": {
    "type": "object",
    "title": "支払金額税込",
    "description": "税込み合計金額（カンマ区切り、小数点以下2桁まで）。税抜き金額しかない場合は、税額を加算して税込みにしてください。",
    "properties": {
      "value": {
        "type": "string",
        "description": "実際の文字列値（支払金額税込）",
        "pattern": "^\\d{1,3}(,\\d{3})*(\\.\\d{2})?$",
        "example": "12,345.67"
      },
      "x": {
        "type": "number",
        "description": "座標X"
      },
      "y": {
        "type": "number",
        "description": "座標Y"
      },
      "width": {
        "type": "number",
        "description": "幅"
      },
      "height": {
        "type": "number",
        "description": "高さ"
      }
    },
    "required": ["value", "x", "y", "width", "height"]
  },
  "currency": {
    "type": "object",
    "title": "通貨",
    "description": "支払金額の通貨。例：JPY、USD、EUR",
    "properties": {
      "value": {
        "type": "string",
        "description": "実際の文字列値（通貨）",
        "pattern": "^[A-Z]{3}$",
        "example": "JPY"
      },
      "x": {
        "type": "number",
        "description": "座標X"
      },
      "y": {
        "type": "number",
        "description": "座標Y"
      },
      "width": {
        "type": "number",
        "description": "幅"
      },
      "height": {
        "type": "number",
        "description": "高さ"
      }
    },
    "required": ["value", "x", "y", "width", "height"]
  },
  "registrationNumber": {
    "type": "object",
    "title": "登録番号",
    "description": "適格請求書発行事業者の登録番号。法人番号がある場合は「T+法人番号」、ない場合は「T+13桁の固有番号」(例：T0000000000000)。",
    "properties": {
      "value": {
        "type": "string",
        "description": "実際の文字列値（登録番号）",
        "pattern": "^T\\d{13}$",
        "example": "T1234567890123"
      },
      "x": {
        "type": "number",
        "description": "座標X"
      },
      "y": {
        "type": "number",
        "description": "座標Y"
      },
      "width": {
        "type": "number",
        "description": "幅"
      },
      "height": {
        "type": "number",
        "description": "高さ"
      }
    },
    "required": ["value", "x", "y", "width", "height"]
  },
  "notes": {
    "type": "object",
    "title": "注記",
    "description": "領収書や支払に関して補足や特記事項があれば記入します。",
    "properties": {
      "value": {
        "type": "string",
        "description": "実際の文字列値（注記）"
      },
      "x": {
        "type": "number",
        "description": "座標X"
      },
      "y": {
        "type": "number",
        "description": "座標Y"
      },
      "width": {
        "type": "number",
        "description": "幅"
      },
      "height": {
        "type": "number",
        "description": "高さ"
      }
    },
    "required": ["value", "x", "y", "width", "height"]
  }
},
"required": [
  "imageWidthPx",
  "imageHeightPx",
  "payeeName",
  "issueDate",
  "amountIncludingTax",
  "currency",
  "registrationNumber",
  "notes"
]
}
`.trim();
};

// Gemini APIを使用してOCRを実行する関数
async function processWithGemini(base64Data, apiKey) {
  const promptText = getPromptText();
  
  // Gemini 2.0 Flash APIのエンドポイント
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  // リクエストボディ
  const requestBody = {
    contents: [
      {
        parts: [
          {
            text: promptText
          },
          {
            inline_data: {
              mime_type: "image/png",
              data: base64Data
            }
          }
        ]
      }
    ]
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Gemini OCR request failed:', errorData);
    throw new Error(`Gemini OCR request failed: ${response.status}`);
  }

  const ocrData = await response.json();

  let ocrText = '';
  if (ocrData.candidates && ocrData.candidates.length > 0) {
    const firstCandidate = ocrData.candidates[0];
    if (firstCandidate.content?.parts) {
      ocrText = firstCandidate.content.parts.map(part => part.text).join('\n');
    }
  }

  return ocrText;
}

// Claude APIを使用してOCRを実行する関数
async function processWithClaude(base64Data, apiKey) {
  const promptText = getPromptText();
  
  // Claude APIのエンドポイント
  const apiUrl = 'https://api.anthropic.com/v1/messages';

  // リクエストボディ
  const requestBody = {
    // model: "claude-3-5-sonnet-20241022",
    model: "claude-3-7-sonnet-20250219",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png", // PNGとして送信する
              data: base64Data
            }
          },
          {
            type: "text",
            text: promptText
          }
        ]
      }
    ]
  };

  // ヘッダー準備（順序とフォーマットが重要）
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'anthropic-dangerous-direct-browser-access': true
  };

  console.log('Claude API Request Headers:', JSON.stringify(headers));
  console.log('Claude API Request Body (structure):', JSON.stringify({
    model: requestBody.model,
    max_tokens: requestBody.max_tokens,
    messages: [{
      role: "user",
      content: "[image and text content]"
    }]
  }));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetails;
    try {
      errorDetails = JSON.parse(errorText);
      console.error('Claude API Error Response:', errorDetails);
    } catch (e) {
      console.error('Claude API Error (non-JSON):', errorText);
    }
    throw new Error(`Claude OCR request failed: ${response.status} - ${errorText}`);
  }

  const ocrData = await response.json();
  
  // Claude APIからの応答に対応する処理
  let ocrText = '';
  if (ocrData.content && ocrData.content.length > 0) {
    ocrText = ocrData.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
  }

  return ocrText;
}

// ChatGPT APIを使用してOCRを実行する関数
async function processWithChatGPT(base64Data, apiKey) {
  const promptText = getPromptText();
  
  // ChatGPT APIのエンドポイント
  const apiUrl = 'https://api.openai.com/v1/chat/completions';

  // リクエストボディ
  const requestBody = {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: promptText
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${base64Data}`
            }
          }
        ]
      }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'InvoiceFields',
        strict: true,
        schema: {
          title: 'InvoiceFields',
          type: 'object',
          properties: {
            imageWidthPx: {
              type: 'number',
              description: '撮影した画像の幅(px)'
            },
            imageHeightPx: {
              type: 'number',
              description: '撮影した画像の高さ(px)'
            },
            payeeName: {
              type: 'object',
              title: '支払先会社名',
              description: '支払先の会社名。宛名や請求先ではなく、実際に支払う先の会社名を示します。',
              properties: {
                value: {
                  type: 'string',
                  description: '実際の文字列値（支払先会社名）'
                },
                x: {
                  type: 'number',
                  description: '座標X'
                },
                y: {
                  type: 'number',
                  description: '座標Y'
                },
                width: {
                  type: 'number',
                  description: '幅'
                },
                height: {
                  type: 'number',
                  description: '高さ'
                }
              },
              required: ['value', 'x', 'y', 'width', 'height'],
              additionalProperties: false
            },
            issueDate: {
              type: 'object',
              title: '発行日',
              description: '領収書を発行した日付（YYYY-MM-DD形式）',
              properties: {
                value: {
                  type: 'string',
                  description: '実際の文字列値（発行日）'
                },
                x: {
                  type: 'number',
                  description: '座標X'
                },
                y: {
                  type: 'number',
                  description: '座標Y'
                },
                width: {
                  type: 'number',
                  description: '幅'
                },
                height: {
                  type: 'number',
                  description: '高さ'
                }
              },
              required: ['value', 'x', 'y', 'width', 'height'],
              additionalProperties: false
            },
            amountIncludingTax: {
              type: 'object',
              title: '支払金額税込',
              description: '税込み合計金額（カンマ区切り、小数点以下2桁まで）。税抜き金額しかない場合は、税額を加算して税込みにしてください。',
              properties: {
                value: {
                  type: 'string',
                  description: '実際の文字列値（支払金額税込）'
                },
                x: {
                  type: 'number',
                  description: '座標X'
                },
                y: {
                  type: 'number',
                  description: '座標Y'
                },
                width: {
                  type: 'number',
                  description: '幅'
                },
                height: {
                  type: 'number',
                  description: '高さ'
                }
              },
              required: ['value', 'x', 'y', 'width', 'height'],
              additionalProperties: false
            },
            currency: {
              type: 'object',
              title: '通貨',
              description: '支払金額の通貨。例：JPY、USD、EUR',
              properties: {
                value: {
                  type: 'string',
                  description: '実際の文字列値（通貨）'
                },
                x: {
                  type: 'number',
                  description: '座標X'
                },
                y: {
                  type: 'number',
                  description: '座標Y'
                },
                width: {
                  type: 'number',
                  description: '幅'
                },
                height: {
                  type: 'number',
                  description: '高さ'
                }
              },
              required: ['value', 'x', 'y', 'width', 'height'],
              additionalProperties: false
            },
            registrationNumber: {
              type: 'object',
              title: '登録番号',
              description: '適格請求書発行事業者の登録番号。法人番号がある場合は「T+法人番号」、ない場合は「T+13桁の固有番号」(例：T0000000000000)。',
              properties: {
                value: {
                  type: 'string',
                  description: '実際の文字列値（登録番号）'
                },
                x: {
                  type: 'number',
                  description: '座標X'
                },
                y: {
                  type: 'number',
                  description: '座標Y'
                },
                width: {
                  type: 'number',
                  description: '幅'
                },
                height: {
                  type: 'number',
                  description: '高さ'
                }
              },
              required: ['value', 'x', 'y', 'width', 'height'],
              additionalProperties: false
            },
            notes: {
              type: 'object',
              title: '注記',
              description: '領収書や支払に関して補足や特記事項があれば記入します。',
              properties: {
                value: {
                  type: 'string',
                  description: '実際の文字列値（注記）'
                },
                x: {
                  type: 'number',
                  description: '座標X'
                },
                y: {
                  type: 'number',
                  description: '座標Y'
                },
                width: {
                  type: 'number',
                  description: '幅'
                },
                height: {
                  type: 'number',
                  description: '高さ'
                }
              },
              required: ['value', 'x', 'y', 'width', 'height'],
              additionalProperties: false
            }
          },
          required: [
            'imageWidthPx',
            'imageHeightPx',
            'payeeName',
            'issueDate',
            'amountIncludingTax',
            'currency',
            'registrationNumber',
            'notes'
          ],
          additionalProperties: false
        }
      }
    },
    max_tokens: 1024
  };

  console.log('ChatGPT API Request (structure):', JSON.stringify({
    model: requestBody.model,
    messages: [{
      role: "user",
      content: "[text and image content]"
    }]
  }));

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorDetails;
    try {
      errorDetails = JSON.parse(errorText);
      console.error('ChatGPT API Error Response:', errorDetails);
    } catch (e) {
      console.error('ChatGPT API Error (non-JSON):', errorText);
    }
    throw new Error(`ChatGPT OCR request failed: ${response.status} - ${errorText}`);
  }

  const ocrData = await response.json();
  
  // ChatGPT APIからの応答に対応する処理
  let ocrText = '';
  if (ocrData.choices && ocrData.choices.length > 0) {
    ocrText = ocrData.choices[0].message.content;
  }

  return ocrText;
}

// 3. OCRボタン押下時に画像を送信 → 結果を取得
ocrBtn.addEventListener('click', async () => {
// キャンバスがあるか、および有効な画像データが含まれているかチェック
if (!canvas || canvas.width === 0 || canvas.height === 0) {
  alert('画像が撮影されていません。');
  return;
}

try {
  // OCR処理中の表示
  ocrBtn.disabled = true;
  ocrBtn.textContent = '処理中...';
  
  // CanvasからBase64を取得
  const dataUrl = canvas.toDataURL('image/png');
  const base64Data = dataUrl.split(',')[1]; // 先頭 "data:image/png;base64," を取り除く

  // 選択されたAIモデルを取得
  const selectedModel = aiModelSelect.value;
  
  // モデルに応じたAPIキーをストレージから取得
  const apiKeys = await chrome.storage.local.get(['geminiApiKey', 'claudeApiKey', 'openaiApiKey']);
  
  let apiKey;
  let modelName;
  
  // APIキーの確認
  switch (selectedModel) {
    case 'gemini':
      apiKey = apiKeys.geminiApiKey;
      modelName = 'Gemini';
      break;
    case 'claude':
      apiKey = apiKeys.claudeApiKey;
      modelName = 'Claude';
      break;
    case 'chatgpt':
      apiKey = apiKeys.openaiApiKey;
      modelName = 'ChatGPT';
      break;
  }
  
  // APIキーがない場合はオプションページに誘導
  if (!apiKey) {
    alert(`先にオプションページで${modelName}のAPIキーを設定してください。`);
    chrome.runtime.openOptionsPage();
    ocrBtn.textContent = 'OCR解析';
    ocrBtn.disabled = false;
    return;
  }
  
  // 選択されたAIサービスで処理
  let ocrText;
  try {
    switch (selectedModel) {
      case 'gemini':
        ocrText = await processWithGemini(base64Data, apiKey);
        break;
      case 'claude':
        ocrText = await processWithClaude(base64Data, apiKey);
        break;
      case 'chatgpt':
        ocrText = await processWithChatGPT(base64Data, apiKey);
        break;
    }
  } catch (error) {
    console.error(`${modelName} OCR処理エラー:`, error);
    alert(`${modelName} OCR処理中にエラーが発生しました: ${error.message}`);
    ocrBtn.textContent = 'OCR解析';
    ocrBtn.disabled = false;
    return;
  }

  // 取得した画像データとOCR結果をストレージに保存
  await chrome.storage.local.set({
    'ocrResults': ocrText,
    'capturedImageData': dataUrl,
    'usedAiModel': selectedModel // 使用したAIモデルを保存
  });

  // 比較画面に遷移する (タブ内で遷移)
  window.location.href = 'comparison.html';

} catch (error) {
  console.error('OCR処理エラー:', error);
  alert('OCR処理中にエラーが発生しました: ' + error.message);
  ocrBtn.textContent = 'OCR解析';
  ocrBtn.disabled = false;
}
});

// 4. 撮り直しボタンの機能
resetBtn.addEventListener('click', () => {
  // 状態をリセット
  capturedImage.style.display = 'none';
  ocrBtn.disabled = true;
  
  // 撮影ボタンと添付ボタンを表示
  captureBtn.style.display = 'block';
  attachBtn.style.display = 'block';
  
  // カメラを再起動
  startCamera()
    .then(() => {
      console.log('カメラ再起動成功');
      resetBtn.style.display = 'none';
    })
    .catch(err => {
      console.error('カメラ再起動エラー:', err);
      alert('カメラの再起動に失敗しました。ページをリロードしてください。');
    });
});

// 5. 添付ボタンのクリックイベント - 隠しファイル入力をクリック
attachBtn.addEventListener('click', () => {
  fileInput.click();
});

// 6. ファイル選択イベント
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    const file = e.target.files[0];
    
    // ファイルタイプチェック (念のため)
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
      alert('JPEGまたはPNG形式の画像ファイルを選択してください。');
      return;
    }

    // 既存のカメラストリームがあれば停止
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
      currentStream = null;
    }
    
    // FileReaderでファイルを読み込む
    const reader = new FileReader();
    reader.onload = (event) => {
      // 画像のDataURLを取得
      const dataUrl = event.target.result;
      
      // 画像表示
      capturedImage.src = dataUrl;
      capturedImage.style.display = 'block';
      video.style.display = 'none';
      video.srcObject = null;
      
      // 画像をキャンバスに描画 (OCR処理用)
      const img = new Image();
      img.onload = function() {
        // キャンバスのサイズを画像に合わせる
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, img.width, img.height);
        
        // ボタン状態を変更
        resetBtn.style.display = 'block';
        captureBtn.style.display = 'none';
        attachBtn.style.display = 'none';
        ocrBtn.disabled = false;
      };
      img.src = dataUrl;
    };
    
    // ファイルを読み込み開始
    reader.readAsDataURL(file);
    
    // ファイル選択をリセット (同じファイルを再選択できるように)
    fileInput.value = '';
  }
});

// 7. ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
});