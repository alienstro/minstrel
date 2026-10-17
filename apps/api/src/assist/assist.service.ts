import { Injectable } from '@nestjs/common';
import {
  ADAPTER_KIND,
  type AssistResult,
  assistBodySchema,
} from '@minstrel/shared';
import { ApiError } from '../common/api-error.js';
import { ConnectionsService } from '../connections/connections.service.js';
import { ProviderRegistry } from '../providers/registry.js';

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
    if (ADAPTER_KIND[conn.adapter] !== 'text') {
      const message =
        'The helper needs a text provider key, for example OpenRouter.';
      throw new ApiError(400, 'invalid_input', message, {
        connectionId: message,
      });
    }
    const chosen = model ?? conn.defaultModel;
    if (!chosen) {
      const message = 'Choose a model for the helper.';
      throw new ApiError(400, 'invalid_input', message, { model: message });
    }
    return this.registry.text().complete(conn, { ...request, model: chosen });
  }
}
