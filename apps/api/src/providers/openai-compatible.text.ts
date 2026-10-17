import { Injectable } from '@nestjs/common';
import {
  assistResultSchema,
  type AssistResult,
  type ModelOption,
  TEXT_LIMITS,
} from '@minstrel/shared';
import { ApiError } from '../common/api-error.js';
import {
  safeFetch as defaultSafeFetch,
  type SafeFetch,
} from '../net/safe-fetch.js';
import {
  errorFromResponse,
  mapProviderError,
  readReason,
} from './provider-error.js';
import type {
  AssistRequest,
  ConnectionCheck,
  DecryptedConnection,
  TextProvider,
} from './types.js';

const TIMEOUT_MS = 60_000;

const INSTRUCTIONS: Record<AssistRequest['task'], string> = {
  lyrics:
    'Write song lyrics for the idea. Mark each part in square brackets, for example [Verse] and [Chorus]. ' +
    'Keep the lyrics under 3000 characters.',
  style:
    'Write a short music style for the idea: genres, mood, instruments, tempo, and voice. ' +
    'Use a comma-separated list under 200 characters.',
  title:
    'Write one short song title for the idea, under 60 characters, with no quotation marks.',
};

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'assist_result',
    strict: true,
    schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
      additionalProperties: false,
    },
  },
} as const;

// Spec §6. One adapter covers each provider with the OpenAI chat completions API.
@Injectable()
export class OpenAiCompatibleTextProvider implements TextProvider {
  readonly adapter = 'openai_compatible' as const;
  readonly displayName = 'OpenAI-compatible';
  readonly defaultBaseUrl = 'https://api.openai.com/v1';
  readonly keyUrl = 'https://platform.openai.com/api-keys';

  constructor(private readonly fetch: SafeFetch = defaultSafeFetch) {}

  async complete(
    conn: DecryptedConnection,
    request: AssistRequest,
  ): Promise<AssistResult> {
    const messages = [
      {
        role: 'system',
        content: `You help a person write a song. ${INSTRUCTIONS[request.task]}`,
      },
      { role: 'user', content: userMessage(request) },
    ];
    let response = await this.chat(conn, {
      model: request.model,
      messages,
      response_format: RESPONSE_FORMAT,
    });
    if (response.status === 400) {
      const reason = await readReason(response);
      if (!/response_format|json_schema/i.test(reason))
        throw mapProviderError(400, reason, conn.label);
      // Some models do not support response_format. Ask for JSON in the prompt one time (spec §6).
      const jsonMessages = [
        ...messages,
        {
          role: 'system',
          content:
            'Reply with JSON only, in this form: {"text": "<your answer>"}',
        },
      ];
      response = await this.chat(conn, {
        model: request.model,
        messages: jsonMessages,
      });
    }
    if (!response.ok) throw await errorFromResponse(response, conn.label);
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    return parseResult(
      body.choices?.[0]?.message?.content,
      request.task,
      conn.label,
    );
  }

  async listModels(conn: DecryptedConnection): Promise<ModelOption[]> {
    const response = await this.get(conn, '/models');
    if (!response.ok) throw await errorFromResponse(response, conn.label);
    const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
    return (body.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort()
      .map((id) => ({ id, label: id }));
  }

  async checkConnection(conn: DecryptedConnection): Promise<ConnectionCheck> {
    try {
      const response = await this.get(conn, '/models');
      if (response.ok) return { ok: true };
      const error = await errorFromResponse(response, conn.label);
      return {
        ok: false,
        status: error.code === 'invalid_key' ? 'invalid_key' : 'unreachable',
        message: error.message,
      };
    } catch {
      return {
        ok: false,
        status: 'unreachable',
        message: mapProviderError(0, '', conn.label).message,
      };
    }
  }

  private async chat(conn: DecryptedConnection, body: object) {
    return this.call(conn, '/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ ...body, max_tokens: 1500 }),
    });
  }

  private get(conn: DecryptedConnection, path: string) {
    return this.call(conn, path, { method: 'GET' });
  }

  private async call(
    conn: DecryptedConnection,
    path: string,
    init: { method: string; body?: string },
  ) {
    try {
      return await this.fetch(`${conn.baseUrl.replace(/\/+$/, '')}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${conn.apiKey}`,
          'content-type': 'application/json',
        },
        totalTimeoutMs: TIMEOUT_MS,
        firstByteTimeoutMs: TIMEOUT_MS,
      });
    } catch {
      throw mapProviderError(0, '', conn.label);
    }
  }
}

function userMessage(request: AssistRequest): string {
  const lines = [`Idea: ${request.idea}`];
  if (request.fields.style) lines.push(`Style: ${request.fields.style}`);
  if (request.fields.title) lines.push(`Title: ${request.fields.title}`);
  if (request.fields.lyrics)
    lines.push(`Lyrics so far:\n${request.fields.lyrics}`);
  return lines.join('\n');
}

function parseResult(
  content: unknown,
  task: AssistRequest['task'],
  label: string,
): AssistResult {
  const text = typeof content === 'string' ? content : '';
  // A model without response_format can wrap the JSON in other text or in a ``` block.
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    parsed = undefined;
  }
  const result = assistResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ApiError(
      422,
      'provider_rejected',
      `${label} did not accept this request: the reply was not in the expected form.`,
    );
  }
  return { text: result.data.text.trim().slice(0, TEXT_LIMITS[task]) };
}
