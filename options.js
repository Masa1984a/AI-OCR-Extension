// options.js
document.addEventListener('DOMContentLoaded', () => {
  // 要素への参照
  const saveButton = document.getElementById('saveKey');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const claudeApiKeyInput = document.getElementById('claudeApiKey');
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const toggleButtons = document.querySelectorAll('.toggle-visibility');
  
  // マスク表示用のAPIキー隠蔽関数
  function maskApiKey(key) {
    if (!key) return '';
    // 最初と最後の4文字を表示し、間は*で隠す（キーが8文字以下の場合はすべて*）
    if (key.length <= 8) {
      return '*'.repeat(key.length);
    }
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  }
  
  // 実際のAPIキー値を保持するオブジェクト
  const actualKeys = {
    geminiApiKey: '',
    claudeApiKey: '',
    openaiApiKey: ''
  };
  
  // 既存のAPIキーがあれば読み込む
  chrome.storage.local.get(['geminiApiKey', 'claudeApiKey', 'openaiApiKey'], (data) => {
    // 実際のキー値を保存
    if (data.geminiApiKey) {
      actualKeys.geminiApiKey = data.geminiApiKey;
      geminiApiKeyInput.value = maskApiKey(data.geminiApiKey);
      geminiApiKeyInput.dataset.masked = 'true';
    }
    
    if (data.claudeApiKey) {
      actualKeys.claudeApiKey = data.claudeApiKey;
      claudeApiKeyInput.value = maskApiKey(data.claudeApiKey);
      claudeApiKeyInput.dataset.masked = 'true';
    }
    
    if (data.openaiApiKey) {
      actualKeys.openaiApiKey = data.openaiApiKey;
      openaiApiKeyInput.value = maskApiKey(data.openaiApiKey);
      openaiApiKeyInput.dataset.masked = 'true';
    }
  });
  
  // 表示/非表示切替ボタンの処理
  toggleButtons.forEach(button => {
    const targetId = button.dataset.for;
    const targetInput = document.getElementById(targetId);
    
    button.addEventListener('click', () => {
      const isMasked = targetInput.type === 'password';
      
      if (isMasked) {
        // マスクを解除して表示
        targetInput.type = 'text';
        button.textContent = '隠す';
        
        // 表示するとき、マスク状態だった場合は実際の値を表示
        if (targetInput.dataset.masked === 'true') {
          targetInput.value = actualKeys[targetId];
          targetInput.dataset.masked = 'false';
        }
      } else {
        // マスクをかけて非表示
        targetInput.type = 'password';
        button.textContent = '表示';
        
        // 値が変更されている場合は、マスクをかけない（ユーザーが編集中の状態）
        if (targetInput.value !== actualKeys[targetId]) {
          targetInput.dataset.masked = 'false';
        } else {
          // 値が元のままなら、マスク表示に戻す
          targetInput.value = maskApiKey(actualKeys[targetId]);
          targetInput.dataset.masked = 'true';
        }
      }
    });
  });
  
  // 入力フィールドのフォーカス時の処理
  const handleInputFocus = (input, keyName) => {
    // マスク状態でフォーカスを得たら、実際の値を表示
    if (input.dataset.masked === 'true') {
      input.type = 'text';
      input.value = actualKeys[keyName];
      input.dataset.masked = 'false';
      
      // 対応するボタンのテキストを更新
      const button = document.querySelector(`.toggle-visibility[data-for="${keyName}"]`);
      if (button) {
        button.textContent = '隠す';
      }
    }
  };
  
  // 入力フィールドのフォーカスアウト時の処理
  const handleInputBlur = (input, keyName) => {
    // 値が変更されていなければ、マスク表示に戻す
    if (input.value === actualKeys[keyName]) {
      input.type = 'password';
      input.value = maskApiKey(actualKeys[keyName]);
      input.dataset.masked = 'true';
      
      // 対応するボタンのテキストを更新
      const button = document.querySelector(`.toggle-visibility[data-for="${keyName}"]`);
      if (button) {
        button.textContent = '表示';
      }
    }
  };
  
  // 各入力フィールドにフォーカスイベントを設定
  geminiApiKeyInput.addEventListener('focus', () => handleInputFocus(geminiApiKeyInput, 'geminiApiKey'));
  claudeApiKeyInput.addEventListener('focus', () => handleInputFocus(claudeApiKeyInput, 'claudeApiKey'));
  openaiApiKeyInput.addEventListener('focus', () => handleInputFocus(openaiApiKeyInput, 'openaiApiKey'));
  
  // 各入力フィールドにブラーイベントを設定
  geminiApiKeyInput.addEventListener('blur', () => handleInputBlur(geminiApiKeyInput, 'geminiApiKey'));
  claudeApiKeyInput.addEventListener('blur', () => handleInputBlur(claudeApiKeyInput, 'claudeApiKey'));
  openaiApiKeyInput.addEventListener('blur', () => handleInputBlur(openaiApiKeyInput, 'openaiApiKey'));
  
  // 保存ボタンのイベントリスナー
  saveButton.addEventListener('click', () => {
    // 実際の値を取得（マスク表示になっている場合は実際の値を使用）
    const geminiKey = geminiApiKeyInput.dataset.masked === 'true' ? 
                      actualKeys.geminiApiKey : 
                      geminiApiKeyInput.value.trim();
                      
    const claudeKey = claudeApiKeyInput.dataset.masked === 'true' ? 
                      actualKeys.claudeApiKey : 
                      claudeApiKeyInput.value.trim();
                      
    const openaiKey = openaiApiKeyInput.dataset.masked === 'true' ? 
                      actualKeys.openaiApiKey : 
                      openaiApiKeyInput.value.trim();
    
    if (!geminiKey && !claudeKey && !openaiKey) {
      alert('少なくとも1つのAPIキーを入力してください');
      return;
    }
    
    // 一時的に保存中の状態を表示
    const originalText = saveButton.textContent;
    saveButton.textContent = '保存中...';
    saveButton.disabled = true;
    
    // 全APIキーをストレージに保存
    chrome.storage.local.set({
      geminiApiKey: geminiKey,
      claudeApiKey: claudeKey,
      openaiApiKey: openaiKey
    }, () => {
      // 実際のキー値を更新
      actualKeys.geminiApiKey = geminiKey;
      actualKeys.claudeApiKey = claudeKey;
      actualKeys.openaiApiKey = openaiKey;
      
      // 入力フィールドをマスク表示に戻す
      geminiApiKeyInput.type = 'password';
      geminiApiKeyInput.value = maskApiKey(geminiKey);
      geminiApiKeyInput.dataset.masked = 'true';
      
      claudeApiKeyInput.type = 'password';
      claudeApiKeyInput.value = maskApiKey(claudeKey);
      claudeApiKeyInput.dataset.masked = 'true';
      
      openaiApiKeyInput.type = 'password';
      openaiApiKeyInput.value = maskApiKey(openaiKey);
      openaiApiKeyInput.dataset.masked = 'true';
      
      // ボタンテキストを元に戻す
      toggleButtons.forEach(button => {
        button.textContent = '表示';
      });
      
      // 保存成功のフィードバック
      saveButton.textContent = '✓ 保存しました';
      
      // 元のテキストに戻す
      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
      }, 2000);
    });
  });
  
  // 各入力フィールドでEnterキーを押したときに保存を実行
  const inputFields = [geminiApiKeyInput, claudeApiKeyInput, openaiApiKeyInput];
  inputFields.forEach(input => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        saveButton.click();
      }
    });
  });
});
  