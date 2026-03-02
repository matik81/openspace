import { Global, Module } from '@nestjs/common';
import { BackendPolicyService } from './backend-policy.service';
import { OperationLimitsService } from './operation-limits.service';

@Global()
@Module({
  providers: [BackendPolicyService, OperationLimitsService],
  exports: [BackendPolicyService, OperationLimitsService],
})
export class CommonModule {}
