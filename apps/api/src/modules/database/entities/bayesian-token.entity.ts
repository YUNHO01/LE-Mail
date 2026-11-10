import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('bayesian_tokens')
export class BayesianToken {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  token: string;

  @Column({ name: 'spam_count', type: 'int', default: 0 })
  spamCount: number;

  @Column({ name: 'ham_count', type: 'int', default: 0 })
  hamCount: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
