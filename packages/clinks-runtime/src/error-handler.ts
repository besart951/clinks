export interface AppErrorDetail {
	readonly message: string;
	readonly kind: string;
	readonly code?: string;
}

export interface ErrorTranslator {
	t(key: string, fallback?: string): string;
}

export type NotificationHandler = (message: string) => void;

export class CentralErrorHandler {
	private translator?: ErrorTranslator;
	private notifier?: NotificationHandler;

	constructor(translator?: ErrorTranslator, notifier?: NotificationHandler) {
		this.translator = translator;
		this.notifier = notifier;
	}

	public extractError(err: unknown, fallbackMessage = 'An unexpected error occurred'): AppErrorDetail {
		if (!err) {
			return { message: fallbackMessage, kind: 'unknown' };
		}

		if (typeof err === 'object' && err !== null) {
			const record = err as Record<string, any>;
			const rawMessage = record.message || record.rawMessage || String(err);
			const metadata = record.meta || record.metadata;

			let kind = 'internal';
			if (metadata && typeof metadata.get === 'function') {
				kind = metadata.get('Clinks-Error-Kind') || metadata.get('clinks-error-kind') || kind;
			} else if (record.kind) {
				kind = String(record.kind);
			}

			const translatedKey = `error.${kind}`;
			let localized = rawMessage;
			if (this.translator && kind !== 'internal' && kind !== 'unknown') {
				const fallbackOrRaw = this.translator.t(translatedKey, rawMessage);
				if (fallbackOrRaw) {
					localized = fallbackOrRaw;
				}
			}

			return {
				message: localized || fallbackMessage,
				kind,
				code: record.code ? String(record.code) : undefined,
			};
		}

		const messageStr = String(err);
		return { message: messageStr || fallbackMessage, kind: 'unknown' };
	}

	public handleError(err: unknown, fallbackMessage = 'An error occurred'): AppErrorDetail {
		const detail = this.extractError(err, fallbackMessage);

		if (this.notifier) {
			try {
				this.notifier(detail.message);
			} catch {
				// Ignore notification failure
			}
		} else if (typeof window !== 'undefined') {
			import('svelte-sonner')
				.then(({ toast }) => {
					toast.error(detail.message);
				})
				.catch(() => {});
		}

		return detail;
	}
}

export const centralErrorHandler = new CentralErrorHandler();
