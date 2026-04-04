export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: any;
}

export interface ModelMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ModelRequest {
  messages: ModelMessage[];
  functions?: FunctionDefinition[];
  systemPrompt?: string;
}

export interface FunctionCall {
  name: string;
  parameters: any;
}

export interface ModelResponse {
  content?: string;
  functionCall?: FunctionCall;
}

export interface ModelProvider {
  generateResponse(request: ModelRequest): Promise<ModelResponse>;
} 