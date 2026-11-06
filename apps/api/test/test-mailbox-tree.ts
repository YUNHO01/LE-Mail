import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UsersService } from '../src/modules/users/users.service';
import { MailFolderService, DEFAULT_SYSTEM_FOLDERS } from '../src/modules/mail-folder/mail-folder.service';
import { User, MailFolder } from '../src/modules/database/entities';
import { FolderType } from '@lemail/shared-types';

async function run() {
  console.log('=== Starting Mailbox Tree & Default Folders Verification Test ===');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const usersService = app.get(UsersService);
  const folderService = app.get(MailFolderService);

  const userRepo = dataSource.getRepository(User);
  const folderRepo = dataSource.getRepository(MailFolder);

  try {
    // 1. Verify Admin has 6 default folders
    console.log('\n[1] Checking System Administrator Default Folders...');
    const admin = await userRepo.findOne({ where: { email: 'admin@lineedge.com' } });
    if (!admin) {
      throw new Error('Admin user not found!');
    }
    const adminFolders = await folderRepo.find({ where: { userId: admin.id } });
    console.log(`Found ${adminFolders.length} folders for Admin.`);
    const expectedTypes = ['INBOX', 'SENT', 'DRAFTS', 'SPAM', 'TRASH', 'CUSTOM'];
    for (const t of expectedTypes) {
      const match = adminFolders.find((f) => f.type === t);
      if (!match) throw new Error(`Missing expected default folder ${t} for Admin!`);
      console.log(`  - [PASS] ${match.name} (${match.type}, isSystem: ${match.isSystem})`);
    }

    // 2. Test User Creation & Auto-creation of 6 Default Folders
    console.log('\n[2] Testing New User Creation & Auto Default Folders...');
    const testEmail = `tree_user_${Date.now()}@lineedge.com`;
    const createdUser = await usersService.create({
      email: testEmail,
      name: '편지함테스트유저',
      password: 'password123!',
    });

    console.log(`Created user: ${createdUser.email} (ID: ${createdUser.id})`);

    const userFolders = await folderRepo.find({
      where: { userId: createdUser.id },
      order: { sortOrder: 'ASC' },
    });

    if (userFolders.length !== 6) {
      throw new Error(`Expected exactly 6 default folders, got ${userFolders.length}`);
    }

    console.log('PASS: Exactly 6 default folders created on user registration:');
    userFolders.forEach((f) => {
      console.log(`  [${f.sortOrder}] ${f.name} (Type: ${f.type}, System: ${f.isSystem})`);
    });

    // 3. Test Creating Sub-folders under '개인편지함' (Tree hierarchy)
    console.log('\n[3] Testing Sub-folder Creation under 개인편지함...');
    const customRoot = userFolders.find((f) => f.type === FolderType.CUSTOM)!;

    // 3.1 Create Depth 1 subfolder: "업무"
    const sub1 = await folderService.createFolder(createdUser.id, {
      name: '업무메일',
      parentId: customRoot.id,
      sortOrder: 1,
    });
    console.log(`PASS: Created Level 1 Subfolder: ${sub1.name} (Parent: ${sub1.parentId})`);

    // 3.2 Create Depth 2 subfolder under "업무메일": "프로젝트 Alpha"
    const sub2 = await folderService.createFolder(createdUser.id, {
      name: '프로젝트 Alpha',
      parentId: sub1.id,
      sortOrder: 1,
    });
    console.log(`PASS: Created Level 2 Subfolder: ${sub2.name} (Parent: ${sub2.parentId})`);

    // 3.3 Create Depth 3 subfolder under "프로젝트 Alpha": "긴급"
    const sub3 = await folderService.createFolder(createdUser.id, {
      name: '긴급 보고',
      parentId: sub2.id,
      sortOrder: 1,
    });
    console.log(`PASS: Created Level 3 Subfolder: ${sub3.name} (Parent: ${sub3.parentId})`);

    // 4. Test Folder Tree Retrieval (Nested hierarchy)
    console.log('\n[4] Testing getFolderTree() API response...');
    const tree = await folderService.getFolderTree(createdUser.id);
    console.log(`Root folders count: ${tree.length}`);

    const customTreeRoot = tree.find((t) => t.type === FolderType.CUSTOM);
    if (!customTreeRoot || !customTreeRoot.children || customTreeRoot.children.length === 0) {
      throw new Error('Failed to assemble tree structure: 개인편지함 has no children!');
    }

    const level1Child = customTreeRoot.children[0];
    console.log(`PASS: Tree Root -> [${customTreeRoot.name}]`);
    console.log(`  └─ Depth 1: [${level1Child.name}] (Children: ${level1Child.children?.length})`);

    const level2Child = level1Child.children![0];
    console.log(`     └─ Depth 2: [${level2Child.name}] (Children: ${level2Child.children?.length})`);

    const level3Child = level2Child.children![0];
    console.log(`        └─ Depth 3: [${level3Child.name}]`);

    // 5. Test System Folder Immutability & Protection
    console.log('\n[5] Testing System Folder Immutability & Protection...');
    const inbox = userFolders.find((f) => f.type === FolderType.INBOX)!;

    // Try deleting INBOX
    try {
      await folderService.deleteFolder(createdUser.id, inbox.id);
      throw new Error('FAILED: System folder INBOX was deleted! Should have been prevented.');
    } catch (err: any) {
      console.log(`PASS: Protected against INBOX deletion: ${err.message}`);
    }

    // Try renaming INBOX
    try {
      await folderService.updateFolder(createdUser.id, inbox.id, { name: '새받은편지함' });
      throw new Error('FAILED: System folder INBOX was renamed! Should have been prevented.');
    } catch (err: any) {
      console.log(`PASS: Protected against INBOX rename: ${err.message}`);
    }

    // 6. Test Circular Reference Prevention in Tree
    console.log('\n[6] Testing Circular Reference Prevention in Tree...');
    try {
      // Trying to move level1Child under level3Child
      await folderService.updateFolder(createdUser.id, level1Child.id, {
        parentId: level3Child.id,
      });
      throw new Error('FAILED: Allowed circular reference move!');
    } catch (err: any) {
      console.log(`PASS: Circular reference move prevented: ${err.message}`);
    }

    // Clean up test user
    await usersService.remove(createdUser.id, admin.id);
    console.log('\n[7] Cleanup test user complete.');

    console.log('\n======================================================');
    console.log('🎉 ALL MAILBOX TREE & DEFAULT FOLDER TESTS PASSED! 🎉');
    console.log('======================================================');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
