import { Injectable } from '@nestjs/common';
import {
  ADAPTER_KIND,
  type AssistBody,
  type AssistResult,
  assistBodySchema,
  type MusicAdapter,
} from '@minstrel/shared';
import { ApiError } from '../common/api-error.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { ProviderRegistry } from '../providers/registry.js';
import type { DecryptedConnection } from '../providers/types.js';

// Spec §6. The result fills the form. The API stores nothing.
@Injectable()
export class AssistService {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly registry: ProviderRegistry,
  ) {}

  async assist(userId: string, input: unknown): Promise<AssistResult> {
    const { connectionId, model, ...request } = assistBodySchema.parse(input);
    const conn = await this.connections.decrypted(userId, connectionId);
    if (ADAPTER_KIND[conn.adapter] === 'music') {
      return this.assistWithMusic(conn, request.task, request.idea);
    }
    const chosen = model ?? conn.defaultModel;
    if (!chosen) {
      const message = 'Choose a model for the helper.';
      throw new ApiError(400, 'invalid_input', message, { model: message });
    }
    return this.registry.text().complete(conn, { ...request, model: chosen });
  }

  // A user with no text key can still write lyrics with a music provider that has writeLyrics, for
  // example kie.ai. Suggest (style and title) needs a text provider.
  private async assistWithMusic(
    conn: DecryptedConnection,
    task: AssistBody['task'],
    idea: string,
  ): Promise<AssistResult> {
    const provider = this.registry.music(conn.adapter as MusicAdapter);
    if (task !== 'lyrics' || !provider.writeLyrics) {
      const message = 'Suggest needs a text provider key, for example OpenRouter.';
      throw new ApiError(400, 'invalid_input', message, { connectionId: message });
    }
    return { text: await provider.writeLyrics(conn, idea) };
  }
}
