#!/usr/bin/env ts-node

import 'dotenv/config';
import { VertexAI } from '@google-cloud/vertexai';

async function main() {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash-001';

  if (!project) {
    console.error('Missing GOOGLE_CLOUD_PROJECT_ID (or GCLOUD_PROJECT).');
    console.error('Set it in backend/.env or your shell before running this script.');
    process.exit(1);
  }

  const prompt =
    process.argv.slice(2).join(' ') ||
    'Reply with exactly: ADC Vertex test passed';

  console.log('--- Vertex ADC Test ---');
  console.log(`project:  ${project}`);
  console.log(`location: ${location}`);
  console.log(`model:    ${model}`);
  console.log(`prompt:   ${prompt}`);

  try {
    const vertex = new VertexAI({ project, location });
    const generativeModel = vertex.getGenerativeModel({ model });

    const result = await generativeModel.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
    });

    const response = await result.response;
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('\n--- Response ---');
    console.log(text || '[empty text response]');
    console.log('\nSUCCESS: Vertex AI call completed using ADC-compatible client auth.');
  } catch (error: any) {
    console.error('\nFAILED: Vertex AI call did not complete.');
    console.error(`name: ${error?.name || 'UnknownError'}`);
    console.error(`message: ${error?.message || String(error)}`);

    if (error?.code) {
      console.error(`code: ${error.code}`);
    }

    process.exit(2);
  }
}

main();
