export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type ClientStackParamList = {
  ClientHome: undefined;
  NewRequest: undefined;
  Tracking: { requestId: string };
  RateJob: { requestId: string };
};

export type LocksmithStackParamList = {
  Dashboard: undefined;
  JobDetail: { requestId: string };
  Earnings: undefined;
};
