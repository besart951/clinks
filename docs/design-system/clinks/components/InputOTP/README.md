# InputOTP

OtpField is the one numeric code field (TOTP, e-mail and approval codes): two halves of digit cells.

## Markup

```svelte
import { OtpField } from '@codelinks/ui/components/otp-field';
<Label for="totp">Code aus deiner Authenticator-App</Label>
<OtpField inputId="totp" bind:value={code} onComplete={submit} />
```

## Rules

- Every numeric code uses it; recovery codes are alphanumeric and stay an Input.
- Cells 40px, 44px tall on touch, 16px digits; `fill` stretches, `size="lg"` grows to 48px.
- Non-digits are dropped while typing and pasting (“123 456” fits). With label and error use `AuthenticatorCodeInput`.

## Source

`otp-field/otp-field.svelte`, `ui/input-otp/*.svelte`
