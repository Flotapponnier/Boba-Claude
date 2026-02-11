import Anthropic from '@anthropic-ai/sdk'
import { tokenService } from './token.service'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: Message[]
  model?: string
}

export interface ChatResponse {
  message: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export class ClaudeService {
  /**
   * Send a message to Claude and get a response
   */
  async sendMessage(
    userId: string,
    request: ChatRequest
  ): Promise<ChatResponse> {
    // Get user's Claude token
    const token = await tokenService.getToken(userId, 'anthropic')

    if (!token) {
      throw new Error('No Claude API token found. Please connect your Claude account.')
    }

    // Initialize Anthropic client
    const client = new Anthropic({
      apiKey: token,
    })

    // Send message to Claude
    const response = await client.messages.create({
      model: request.model || 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    })

    // Extract text from response
    const textContent = response.content.find(block => block.type === 'text')
    const message = textContent && 'text' in textContent ? textContent.text : ''

    return {
      message,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    }
  }

  /**
   * Stream a message to Claude
   * Returns an async generator that yields text chunks
   */
  async *streamMessage(
    userId: string,
    request: ChatRequest
  ): AsyncGenerator<string, void, unknown> {
    // Get user's Claude token
    const token = await tokenService.getToken(userId, 'anthropic')

    if (!token) {
      throw new Error('No Claude API token found. Please connect your Claude account.')
    }

    // Initialize Anthropic client
    const client = new Anthropic({
      apiKey: token,
    })

    // Stream message to Claude
    const stream = await client.messages.stream({
      model: request.model || 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    })

    // Yield text chunks as they arrive
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        yield chunk.delta.text
      }
    }
  }
}

export const claudeService = new ClaudeService()
