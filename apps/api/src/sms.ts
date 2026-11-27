/**
 * Text messages for appointment reminders. Prepared only: the provider follows later, so the one transport is
 * `none` and the settings show SMS as «folgt». With a provider: add its transport here, put it on `Services`, send
 * from `AppointmentReminders` to `contacts.mobile`, and enable the channel choice.
 */
export interface SmsTransport {
	readonly name: string;
	/** `to` in E.164 (`+41791234567`). */
	send(to: string, text: string): Promise<void>;
}

export const noSms: SmsTransport = {
	name: 'none',
	send() {
		return Promise.reject(new Error('No SMS provider configured'));
	},
};
