#!/usr/bin/env node

/**
 * Interactive wrapper for sync-metadata that prompts user to choose what to sync
 * Usage: npm run sync
 */

import * as readline from 'readline';
import { main as syncMetadata } from './sync-metadata';

function askQuestion(question: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log('🔄 Sync Metadata to Local Database');
    console.log('===================================');
    console.log('');
    console.log('What would you like to sync?');
    console.log('1. View');
    console.log('2. Prompt Template');
    console.log('3. Both (View and Prompt Template)');
    console.log('');

    let filterType: 'view' | 'prompttemplate' | undefined;

    while (true) {
        const answer = await askQuestion('Enter your choice (1, 2, or 3): ');

        if (answer === '1') {
            filterType = 'view';
            console.log('');
            console.log('📋 Syncing views...');
            break;
        } else if (answer === '2') {
            filterType = 'prompttemplate';
            console.log('');
            console.log('📝 Syncing prompt templates...');
            break;
        } else if (answer === '3') {
            filterType = undefined; // undefined means both
            console.log('');
            console.log('🔄 Syncing both views and prompt templates...');
            break;
        } else {
            console.log('❌ Invalid choice. Please enter 1, 2, or 3.');
        }
    }

    console.log('');

    try {
        await syncMetadata(filterType);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}

export { main };

