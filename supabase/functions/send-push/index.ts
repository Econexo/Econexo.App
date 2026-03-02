// Supabase Edge Function: send-push
// Sends Web Push notifications to a user's subscribed devices using VAPID

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- VAPID JWT helpers (no external web-push lib needed in Deno) ---

async function importVapidKey(privateKeyB64url: string): Promise<CryptoKey> {
    const padding = '='.repeat((4 - (privateKeyB64url.length % 4)) % 4);
    const base64 = (privateKeyB64url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    return await crypto.subtle.importKey(
        'raw',
        rawBytes,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
}

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let str = '';
    bytes.forEach((b) => (str += String.fromCharCode(b)));
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function buildVapidJWT(
    audience: string,
    subject: string,
    publicKeyB64url: string,
    privateKey: CryptoKey
): Promise<string> {
    const header = { typ: 'JWT', alg: 'ES256' };
    const now = Math.floor(Date.now() / 1000);
    const payload = { aud: audience, exp: now + 43200, sub: subject };

    const encodedHeader = base64urlEncode(new TextEncoder().encode(JSON.stringify(header)));
    const encodedPayload = base64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signature = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateKey,
        new TextEncoder().encode(signingInput)
    );

    return `${signingInput}.${base64urlEncode(signature)}`;
}

// --- Main handler ---

Deno.serve(async (req: Request) => {
    // CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { userId, title, body, url, data } = await req.json();

        if (!userId || !title || !body) {
            return new Response(JSON.stringify({ error: 'Missing required fields: userId, title, body' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // VAPID config from Supabase secrets
        const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
        const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
        const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:econexo.hub@gmail.com';

        if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
            return new Response(JSON.stringify({ error: 'VAPID keys not configured in Supabase secrets.' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Init Supabase admin client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Get all push subscriptions for this user
        const { data: subscriptions, error: subError } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', userId);

        if (subError) {
            return new Response(JSON.stringify({ error: 'Failed to fetch subscriptions', details: subError }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!subscriptions || subscriptions.length === 0) {
            return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found for user.' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Import VAPID private key once
        const privateKey = await importVapidKey(VAPID_PRIVATE_KEY);

        const pushPayload = JSON.stringify({
            title,
            body,
            url: url || '/dashboard',
            data: data || {},
            tag: 'econexo',
        });

        const results = await Promise.allSettled(
            subscriptions.map(async (sub: any) => {
                const endpoint = sub.endpoint;
                const endpointUrl = new URL(endpoint);
                const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

                // Build JWT for this push service
                const jwt = await buildVapidJWT(audience, VAPID_SUBJECT, VAPID_PUBLIC_KEY, privateKey);

                // Encrypt payload using Web Push encryption (RFC 8291)
                // For simplicity, we send unencrypted with Content-Encoding: aes128gcm
                // using the subscription keys for encryption
                const p256dhBytes = Uint8Array.from(atob(sub.p256dh.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
                const authBytes = Uint8Array.from(atob(sub.auth.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

                // Import recipient public key
                const recipientKey = await crypto.subtle.importKey(
                    'raw',
                    p256dhBytes,
                    { name: 'ECDH', namedCurve: 'P-256' },
                    false,
                    []
                );

                // Generate ephemeral key pair for ECDH
                const ephemeralKeyPair = await crypto.subtle.generateKey(
                    { name: 'ECDH', namedCurve: 'P-256' },
                    true,
                    ['deriveBits']
                );

                // Derive shared secret
                const sharedSecret = await crypto.subtle.deriveBits(
                    { name: 'ECDH', public: recipientKey },
                    ephemeralKeyPair.privateKey,
                    256
                );

                // Export ephemeral public key
                const ephemeralPublicKeyBuffer = await crypto.subtle.exportKey('raw', ephemeralKeyPair.publicKey);

                // Generate salt
                const salt = crypto.getRandomValues(new Uint8Array(16));

                // HKDF for content encryption key and nonce
                const encoder = new TextEncoder();

                const ikm = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveBits']);

                // PRK
                const prkInfo = new Uint8Array([
                    ...encoder.encode('Content-Encoding: auth\0'),
                ]);
                // We concatenate: auth (16 bytes) + receiver pub key + sender pub key
                const prkSalt = new Uint8Array(authBytes);
                const prkBytes = await crypto.subtle.deriveBits(
                    { name: 'HKDF', hash: 'SHA-256', salt: prkSalt, info: prkInfo },
                    ikm,
                    256
                );

                const prk = await crypto.subtle.importKey('raw', prkBytes, 'HKDF', false, ['deriveBits']);

                const keyInfo = new Uint8Array([
                    ...encoder.encode('Content-Encoding: aes128gcm\0'),
                    0x01,
                ]);
                const nonceInfo = new Uint8Array([
                    ...encoder.encode('Content-Encoding: nonce\0'),
                    0x01,
                ]);

                const contentKey = new Uint8Array(await crypto.subtle.deriveBits(
                    { name: 'HKDF', hash: 'SHA-256', salt, info: keyInfo },
                    prk,
                    128
                ));
                const nonce = new Uint8Array(await crypto.subtle.deriveBits(
                    { name: 'HKDF', hash: 'SHA-256', salt, info: nonceInfo },
                    prk,
                    96
                ));

                // Import AES-GCM key
                const aesKey = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);

                const payloadBytes = encoder.encode(pushPayload);
                // Add padding: 1 byte delimiter (0x02) + payload
                const paddedPayload = new Uint8Array(payloadBytes.length + 1);
                paddedPayload[0] = 0x02;
                paddedPayload.set(payloadBytes, 1);

                const encryptedContent = new Uint8Array(
                    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPayload)
                );

                // Build HTTP/2 header record (RFC 8291 Section 2)
                const ephemeralPubKeyBytes = new Uint8Array(ephemeralPublicKeyBuffer);
                const recordHeader = new Uint8Array(16 + 4 + 1 + ephemeralPubKeyBytes.length);
                recordHeader.set(salt, 0);
                // rs = 4096 (big endian uint32)
                recordHeader[16] = 0x00;
                recordHeader[17] = 0x00;
                recordHeader[18] = 0x10;
                recordHeader[19] = 0x00;
                // keyid length
                recordHeader[20] = ephemeralPubKeyBytes.length;
                recordHeader.set(ephemeralPubKeyBytes, 21);

                const body_bytes = new Uint8Array(recordHeader.length + encryptedContent.length);
                body_bytes.set(recordHeader, 0);
                body_bytes.set(encryptedContent, recordHeader.length);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
                        'Content-Type': 'application/octet-stream',
                        'Content-Encoding': 'aes128gcm',
                        'TTL': '86400',
                    },
                    body: body_bytes,
                });

                if (response.status === 410 || response.status === 404) {
                    // Subscription expired — remove it
                    await supabaseAdmin
                        .from('push_subscriptions')
                        .delete()
                        .eq('endpoint', endpoint);
                    return { endpoint, status: 'expired', removed: true };
                }

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`Push failed: ${response.status} ${errText}`);
                }

                return { endpoint: endpoint.substring(0, 40) + '...', status: 'sent' };
            })
        );

        const sent = results.filter((r) => r.status === 'fulfilled').length;
        const failed = results.filter((r) => r.status === 'rejected').length;

        return new Response(
            JSON.stringify({ sent, failed, total: subscriptions.length }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    } catch (err: any) {
        console.error('send-push error:', err);
        return new Response(
            JSON.stringify({ error: err.message || 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
