// Message Parser - Equivalente a NN_02_Message_Parser de n8n
// Parsea mensajes de Telegram y extrae chat_id, texto, username

export interface MessageParserInput {
  chat_id: string;
  text: string;
}

export interface MessageParserData {
  chat_id: number;
  text: string;
  username: string;
  type: string;
}

export interface MessageParserResponse {
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  data: MessageParserData | null;
  _meta: {
    source: string;
    timestamp: string;
    workflow_id: string;
    version: string;
  };
}

export async function main(input: MessageParserInput): Promise<MessageParserResponse> {
  const source = "NN_02_Message_Parser";
  const workflowID = "message-parser-v1";
  const version = "2.0.0";

  // === VALIDATION FUNCTIONS ===
  
  // Chat ID validation: must be positive integer
  const CHAT_ID_RE = /^\d+$/;
  function validateChatId(id: string): { valid: boolean; error?: string; value?: number } {
    if (!id || id === null || id === undefined) {
      return { valid: false, error: 'chat_id is required' };
    }
    
    const idStr = String(id).trim();
    if (!CHAT_ID_RE.test(idStr)) {
      return { valid: false, error: 'chat_id must be a positive integer' };
    }
    
    const idNum = Number(idStr);
    if (idNum < 0 || idNum > 9_007_199_254_740_991) {
      return { valid: false, error: 'chat_id out of valid range' };
    }
    
    return { valid: true, value: idNum };
  }

  // Text validation: 1-500 chars, printable characters only
  const TEXT_RE = /^[\t\n\r\u0020-\u007E\u00C0-\u017F\u0400-\u04FF\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF]{1,500}$/;
  function validateText(txt: string): { valid: boolean; error?: string; value?: string } {
    if (!txt || txt === null || txt === undefined) {
      return { valid: false, error: 'text is required' };
    }
    
    const txtStr = String(txt).trim();
    if (txtStr.length === 0) {
      return { valid: false, error: 'text cannot be empty' };
    }
    
    if (!TEXT_RE.test(txtStr)) {
      return { valid: false, error: 'text contains invalid characters' };
    }
    
    return { valid: true, value: txtStr };
  }

  // === PERFORM VALIDATION ===
  const chatIdResult = validateChatId(input.chat_id);
  const textResult = validateText(input.text);

  // Return validation errors
  if (!chatIdResult.valid || !textResult.valid) {
    const errors: string[] = [];
    if (!chatIdResult.valid) errors.push(chatIdResult.error!);
    if (!textResult.valid) errors.push(textResult.error!);
    
    return {
      success: false,
      error_code: 'VALIDATION_ERROR',
      error_message: errors.join('; '),
      data: null,
      _meta: { 
        source,
        timestamp: new Date().toISOString(),
        workflow_id: workflowID,
        version
      }
    };
  }

  // === SANITIZE FOR SQL ===
  const safeText = textResult.value!
    .replaceAll('\\', '\\\\')
    .replaceAll('\'', "''")
    .slice(0, 500);

  const safeUsername = "User";

  // === RETURN SUCCESS ===
  return {
    success: true,
    error_code: null,
    error_message: null,
    data: {
      chat_id: chatIdResult.value!,
      text: safeText,
      username: safeUsername,
      type: 'text'
    },
    _meta: { 
      source,
      timestamp: new Date().toISOString(),
      workflow_id: workflowID,
      version
    }
  };
}
