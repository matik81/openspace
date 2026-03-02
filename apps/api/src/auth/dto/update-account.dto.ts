export class UpdateAccountDto {
  firstName!: string;
  lastName!: string;
  email!: string;
  password!: string;
  newPassword?: string;
}
