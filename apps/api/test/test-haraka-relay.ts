import * as nodemailer from 'nodemailer';

async function testHarakaRelay() {
  console.log('[Test] Connecting to Haraka Outbound MTA at 127.0.0.1:2526...');

  const transporter = nodemailer.createTransport({
    host: '127.0.0.1',
    port: 2526,
    secure: false,
    ignoreTLS: true,
  });

  try {
    const info = await transporter.sendMail({
      from: '"LEMail System" <admin@lineedge.com>',
      to: 'solgen001@gmail.com',
      subject: '[LEMail-Haraka Test] Direct Outbound Delivery Test',
      text: 'This is a test email sent from LEMail API via Haraka Outbound MTA.',
      html: '<p>This is a test email sent from <b>LEMail API</b> via <b>Haraka Outbound MTA</b>.</p>',
    });

    console.log('[Test] Haraka accepted message successfully!');
    console.log('[Test] Response:', info.response);
    console.log('[Test] MessageId:', info.messageId);
  } catch (err: any) {
    console.error('[Test] Failed to send via Haraka:', err.message);
  }
}

testHarakaRelay();
