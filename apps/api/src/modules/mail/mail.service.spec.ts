jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
  InjectDataSource: () => () => {},
}));
jest.mock('@nestjs/config', () => ({
  ConfigService: class {},
}));

import { FolderType } from '@lemail/shared-types';
import { MailFolder, UserMail } from '../database/entities';
import { MailService } from './mail.service';

describe('MailService UID allocation on delete/move', () => {
  const userId = 'user-1';
  const trashFolderId = 'trash-folder-1';
  const inboxFolderId = 'inbox-folder-1';

  function createServiceWithState(initialState: {
    trashFolder: Partial<MailFolder>;
    userMails: Array<Partial<UserMail>>;
  }) {
    const trashFolder = {
      id: trashFolderId,
      userId,
      name: '휴지통',
      type: FolderType.TRASH,
      uidnext: 1,
      ...initialState.trashFolder,
    } as MailFolder;

    const userMails = initialState.userMails.map((um) => ({ ...um })) as UserMail[];

    const manager = {
      createQueryBuilder: jest.fn((entity: unknown) => {
        if (entity === MailFolder) {
          return {
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(trashFolder),
          };
        }
        if (entity === UserMail) {
          return {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockImplementation(async () => {
              const inTrash = userMails.filter((m) => m.folderId === trashFolder.id);
              const maxUid = inTrash.reduce((max, m) => Math.max(max, m.uid || 0), 0);
              return { maxUid };
            }),
          };
        }
        throw new Error('Unexpected entity');
      }),
      update: jest.fn().mockImplementation(async (_entity, _criteria, partial) => {
        if (typeof partial.uidnext === 'number') {
          trashFolder.uidnext = partial.uidnext;
        }
      }),
    };

    const folderRepo = {
      findOne: jest.fn().mockImplementation(async ({ where }: any) => {
        if (where?.type === FolderType.TRASH || where?.id === trashFolder.id) {
          return trashFolder;
        }
        return null;
      }),
      manager: {
        transaction: jest.fn(async (cb: (m: typeof manager) => Promise<number>) =>
          cb(manager),
        ),
      },
    };

    const userMailRepo = {
      find: jest.fn().mockImplementation(async ({ where }: any) => {
        return userMails.filter(
          (m) =>
            m.userId === where.userId &&
            m.messageId === where.messageId &&
            (!where.folderId || m.folderId === where.folderId),
        );
      }),
      save: jest.fn().mockImplementation(async (items: UserMail | UserMail[]) => {
        const arr = Array.isArray(items) ? items : [items];
        const seen = new Set<string>();
        for (const m of userMails) {
          seen.add(`${m.folderId}:${m.uid}`);
        }
        // Simulate idx_folder_uid unique constraint check
        for (const item of arr) {
          const idx = userMails.findIndex((m) => m.id === item.id);
          if (idx >= 0) {
            userMails[idx] = { ...item };
          }
        }
        const checkSet = new Set<string>();
        for (const m of userMails) {
          const key = `${m.folderId}:${m.uid}`;
          if (checkSet.has(key)) {
            throw new Error(`Duplicate entry '${key}' for key 'user_mail.idx_folder_uid'`);
          }
          checkSet.add(key);
        }
        return Array.isArray(items) ? arr : arr[0];
      }),
    };

    const noop = {} as any;
    const service = new MailService(
      noop, // messageRepo
      noop, // attachmentRepo
      noop, // recipientRepo
      folderRepo as any,
      userMailRepo as any,
      noop, // userRepo
      noop, // workerPool
      noop, // settingsService
      noop, // rateLimitService
      noop, // dkimSignService
      noop, // accountDefenseService
      noop, // secureMailService
      noop, // usersService
    );

    return { service, trashFolder, userMails };
  }

  it('assigns non-colliding UIDs when bulk-deleting multiple mails with uid=1 to trash', async () => {
    const { service, trashFolder, userMails } = createServiceWithState({
      // Simulate drifted uidnext=1 even though trash already has uid=1
      trashFolder: { uidnext: 1 },
      userMails: [
        { id: 'um-existing-trash', userId, messageId: 'msg-0', folderId: trashFolderId, uid: 1 },
        { id: 'um-1', userId, messageId: 'msg-1', folderId: inboxFolderId, uid: 1 },
        { id: 'um-2', userId, messageId: 'msg-2', folderId: 'sent-folder-1', uid: 1 },
      ],
    });

    const result = await service.bulkDelete(userId, ['msg-1', 'msg-2']);

    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(userMails.find((m) => m.id === 'um-1')).toMatchObject({
      folderId: trashFolderId,
      uid: 2,
    });
    expect(userMails.find((m) => m.id === 'um-2')).toMatchObject({
      folderId: trashFolderId,
      uid: 3,
    });
    expect(trashFolder.uidnext).toBe(4);
  });

  it('assigns distinct UIDs when moveMail moves multiple user_mail entries', async () => {
    const { service, trashFolder, userMails } = createServiceWithState({
      trashFolder: { uidnext: 5 },
      userMails: [
        { id: 'um-a', userId, messageId: 'msg-multi', folderId: inboxFolderId, uid: 1 },
        { id: 'um-b', userId, messageId: 'msg-multi', folderId: 'custom-1', uid: 2 },
      ],
    });

    await service.moveMail(userId, 'msg-multi', trashFolderId);

    expect(userMails.find((m) => m.id === 'um-a')).toMatchObject({
      folderId: trashFolderId,
      uid: 5,
    });
    expect(userMails.find((m) => m.id === 'um-b')).toMatchObject({
      folderId: trashFolderId,
      uid: 6,
    });
    expect(trashFolder.uidnext).toBe(7);
  });
});
