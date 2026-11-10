import { SetMetadata } from '@nestjs/common';

export const SKIP_LICENSE_CHECK_KEY = 'skipLicenseCheck';
export const SkipLicenseCheck = () => SetMetadata(SKIP_LICENSE_CHECK_KEY, true);
