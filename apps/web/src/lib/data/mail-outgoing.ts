import type { MailSendCancelInput, MailSendInput, MailSendResult, OwnSenderView } from '@clinks/contracts/mail';
import type { ApiClient } from './api-client.ts';
import type { WorkspaceApi } from './workspace-api.ts';

/** «Senden» in the mail module and the senders to choose from, through the API or the demo's stand-in. */
export class MailOutgoing {
	readonly #client: ApiClient | null;
	readonly #api: () => WorkspaceApi;
	constructor(client: ApiClient | null, api: () => WorkspaceApi) {
		this.#client = client;
		this.#api = api;
	}

	senders(): Promise<OwnSenderView[]> {
		return this.#client
			? this.#client.request<OwnSenderView[]>('GET', '/mail/my-senders')
			: this.#api().mailOutgoing.senders();
	}

	send(input: MailSendInput): Promise<MailSendResult> {
		return this.#client
			? this.#client.request<MailSendResult>('POST', '/mail/send', input)
			: this.#api().mailOutgoing.send(input);
	}

	/** «Undo send» while the mails still wait in the queue. */
	cancel(input: MailSendCancelInput): Promise<{ cancelled: number }> {
		return this.#client
			? this.#client.request<{ cancelled: number }>('POST', '/mail/send/cancel', input)
			: this.#api().mailOutgoing.cancel(input);
	}
}
