import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { syncDatabaseSchema } from './scripts/init-schema';
import {
  Domain,
  Mailbox,
  MailMessage,
  MailRecipient,
  MailAttachment,
  User,
  MailFolder,
  UserMail,
  SystemSetting,
  SpamRule,
  BayesianToken,
  SystemLicense,
  MailBackup,
  ContactGroup,
  Contact,
  Calendar,
  CalendarEvent,
  CalendarEventAttendee,
  SystemHoliday,
  Department,
  OrgSyncLog,
  UserPasskey,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const poolSize = configService.get<number>('database.poolSize') || 20;
        return {
          type: 'mysql',
          host: configService.get<string>('database.host'),
          port: configService.get<number>('database.port'),
          username: configService.get<string>('database.username'),
          password: configService.get<string>('database.password'),
          database: configService.get<string>('database.database'),
          entities: [
            Domain,
            Mailbox,
            MailMessage,
            MailRecipient,
            MailAttachment,
            User,
            MailFolder,
            UserMail,
            SystemSetting,
            SpamRule,
            BayesianToken,
            SystemLicense,
            MailBackup,
            ContactGroup,
            Contact,
            Calendar,
            CalendarEvent,
            CalendarEventAttendee,
            SystemHoliday,
            Department,
            OrgSyncLog,
            UserPasskey,
          ],
          synchronize: false,
          timezone: 'Z',
          extra: {
            connectionLimit: poolSize,
          },
        };
      },
    }),
    TypeOrmModule.forFeature([
      Domain,
      Mailbox,
      MailMessage,
      MailRecipient,
      MailAttachment,
      User,
      MailFolder,
      UserMail,
      SystemSetting,
      SpamRule,
      SystemLicense,
      MailBackup,
      ContactGroup,
      Contact,
      Calendar,
      CalendarEvent,
      CalendarEventAttendee,
      SystemHoliday,
      Department,
      OrgSyncLog,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Running startup database schema sync...');
    await syncDatabaseSchema(
      (sql, params) => this.dataSource.query(sql, params),
      this.logger,
    );
    await this.verifyEntitySchemaDrift();
    this.logger.log('Startup database schema sync completed.');
  }

  /**
   * TypeORM 엔티티와 실제 DB 컬럼 간 불일치(init-schema.ts 누락) 감지
   */
  private async verifyEntitySchemaDrift(): Promise<void> {
    try {
      const rows: Array<{ TABLE_NAME: string; COLUMN_NAME: string }> =
        await this.dataSource.query(
          'SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()',
        );

      const dbColumnsByTable = new Map<string, Set<string>>();
      for (const row of rows) {
        const table = row.TABLE_NAME.toLowerCase();
        if (!dbColumnsByTable.has(table)) {
          dbColumnsByTable.set(table, new Set());
        }
        dbColumnsByTable.get(table)!.add(row.COLUMN_NAME.toLowerCase());
      }

      for (const meta of this.dataSource.entityMetadatas) {
        const tableName = meta.tableName.toLowerCase();
        const dbCols = dbColumnsByTable.get(tableName);
        if (!dbCols) {
          this.logger.warn(
            `[SchemaDrift] Table "${meta.tableName}" (Entity: ${meta.name}) is missing in DB. Please add it to init-schema.ts.`,
          );
          continue;
        }
        for (const col of meta.columns) {
          const colName = col.databaseName.toLowerCase();
          if (!dbCols.has(colName)) {
            this.logger.warn(
              `[SchemaDrift] Column "${meta.tableName}.${col.databaseName}" (Entity: ${meta.name}.${col.propertyName}) is missing in DB. Please add it to init-schema.ts.`,
            );
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to verify entity schema drift: ${err?.message || err}`);
    }
  }
}
