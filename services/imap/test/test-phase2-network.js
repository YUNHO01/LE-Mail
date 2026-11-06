"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const net = __importStar(require("net"));
const tls = __importStar(require("tls"));
const imap_server_1 = require("../src/server/imap-server");
const TEST_CONFIG = {
    host: '127.0.0.1',
    port: 11430,
    securePort: 19930,
    enableStartTls: true,
    maxConnections: 50,
    authTimeoutMs: 10000,
    archiveDir: './mail-archive',
};
function readUntil(socket, expectedMatch) {
    return new Promise((resolve, reject) => {
        let accumulated = '';
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout waiting for '${expectedMatch}'. Received so far: ${accumulated}`));
        }, 5000);
        const onData = (chunk) => {
            accumulated += chunk.toString('utf8');
            if (accumulated.includes(expectedMatch)) {
                cleanup();
                resolve(accumulated);
            }
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            clearTimeout(timeout);
            socket.removeListener('data', onData);
            socket.removeListener('error', onError);
        };
        socket.on('data', onData);
        socket.on('error', onError);
    });
}
async function runTests() {
    console.log('=== [PHASE 2 TEST] IMAP TCP/TLS Network Layer Verification ===\n');
    const server = new imap_server_1.ImapServer(TEST_CONFIG);
    await server.start();
    console.log('[Server] Test IMAP server started on ports 11430 (Plain) and 19930 (IMAPS).\n');
    try {
        // -------------------------------------------------------------
        // Test 1: Plain TCP connection, Banner, CAPABILITY, NOOP, LOGOUT
        // -------------------------------------------------------------
        console.log('[Test 1] Testing Plain TCP Connection & Basic Commands...');
        const plainClient = net.createConnection({ host: '127.0.0.1', port: 11430 });
        const banner = await readUntil(plainClient, '\r\n');
        console.log(`  Received Welcome Banner: ${banner.trim()}`);
        if (!banner.startsWith('* OK') || !banner.includes('IMAP4rev1')) {
            throw new Error(`Invalid welcome banner: ${banner}`);
        }
        plainClient.write('A001 CAPABILITY\r\n');
        const capResp = await readUntil(plainClient, 'A001 OK');
        console.log(`  Received CAPABILITY response:\n    ${capResp.trim().replace(/\r\n/g, '\n    ')}`);
        if (!capResp.includes('* CAPABILITY') || !capResp.includes('A001 OK')) {
            throw new Error(`Invalid CAPABILITY response: ${capResp}`);
        }
        plainClient.write('A002 NOOP\r\n');
        const noopResp = await readUntil(plainClient, 'A002 OK');
        console.log(`  Received NOOP response: ${noopResp.trim()}`);
        plainClient.write('A003 LOGOUT\r\n');
        const logoutResp = await readUntil(plainClient, 'A003 OK');
        console.log(`  Received LOGOUT response: ${logoutResp.trim()}`);
        plainClient.end();
        console.log('  -> [PASS] Test 1: Plain TCP communication completed successfully.\n');
        // -------------------------------------------------------------
        // Test 2: STARTTLS upgrade over plain connection
        // -------------------------------------------------------------
        console.log('[Test 2] Testing STARTTLS In-line Socket Upgrade...');
        const starttlsClient = net.createConnection({ host: '127.0.0.1', port: 11430 });
        await readUntil(starttlsClient, '\r\n');
        starttlsClient.write('S001 STARTTLS\r\n');
        const starttlsResp = await readUntil(starttlsClient, 'S001 OK');
        console.log(`  Received STARTTLS acknowledgment: ${starttlsResp.trim()}`);
        // Upgrade client socket to TLS
        const upgradedTlsSocket = await new Promise((resolve, reject) => {
            const tlsSocket = tls.connect({
                socket: starttlsClient,
                rejectUnauthorized: false,
            });
            tlsSocket.once('secureConnect', () => resolve(tlsSocket));
            tlsSocket.once('error', reject);
        });
        console.log('  STARTTLS handshake established securely!');
        upgradedTlsSocket.write('S002 CAPABILITY\r\n');
        const secureCapResp = await readUntil(upgradedTlsSocket, 'S002 OK');
        console.log(`  Received Post-TLS CAPABILITY:\n    ${secureCapResp.trim().replace(/\r\n/g, '\n    ')}`);
        upgradedTlsSocket.write('S003 LOGOUT\r\n');
        await readUntil(upgradedTlsSocket, 'S003 OK');
        upgradedTlsSocket.end();
        console.log('  -> [PASS] Test 2: STARTTLS negotiation & secure command execution verified.\n');
        // -------------------------------------------------------------
        // Test 3: Direct TLS / IMAPS (Port 19930)
        // -------------------------------------------------------------
        console.log('[Test 3] Testing Direct TLS / IMAPS Connection...');
        const imapsClient = tls.connect({
            host: '127.0.0.1',
            port: 19930,
            rejectUnauthorized: false,
        });
        const imapsBanner = await readUntil(imapsClient, '\r\n');
        console.log(`  Received IMAPS Welcome Banner: ${imapsBanner.trim()}`);
        if (!imapsBanner.startsWith('* OK')) {
            throw new Error(`Invalid IMAPS banner: ${imapsBanner}`);
        }
        imapsClient.write('T001 CAPABILITY\r\n');
        const imapsCap = await readUntil(imapsClient, 'T001 OK');
        console.log(`  Received IMAPS CAPABILITY:\n    ${imapsCap.trim().replace(/\r\n/g, '\n    ')}`);
        imapsClient.write('T002 LOGOUT\r\n');
        await readUntil(imapsClient, 'T002 OK');
        imapsClient.end();
        console.log('  -> [PASS] Test 3: Direct TLS/IMAPS connection verified.\n');
        console.log('=== ALL PHASE 2 TESTS PASSED SUCCESSFULLY! ===');
    }
    finally {
        await server.stop();
    }
}
runTests().catch((err) => {
    console.error('\n❌ Phase 2 Test Failed:', err);
    process.exit(1);
});
