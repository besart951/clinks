async function seed() {
	const response = await fetch('http://localhost:8080/clinks.v1.ClinksService/Register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			email: 'user@example.com',
			password: 'user-password-min-12-chars',
			tenantName: 'Demo Firma',
		}),
	});
	const data = await response.json();
	console.log('Seed response:', response.status, data);
}

seed().catch(console.error);
