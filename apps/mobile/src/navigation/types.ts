export type StudentsStackParamList = {
  StudentsMain: undefined;
  StudentFiche: { studentId: string; studentName?: string };
  Enrollment: { studentId?: string } | undefined;
};

export type ChildrenStackParamList = {
  ChildrenMain: undefined;
  StudentFiche: { studentId: string; studentName?: string };
};

export type MoreStackParamList = {
  MoreMain: undefined;
  FamilyScreens: { familyId: string; familyLabel: string };
  ComingSoon: { screenId: string; title: string; phase?: string };
  AcademicStats: undefined;
  FormationClasse: undefined;
  OrganisationHub: undefined;
  OrgAcademicYears: undefined;
  OrgSubjects: undefined;
  OrgClasses: undefined;
  OrgRooms: undefined;
  OrgTeachers: undefined;
  SchoolAdmin: undefined;
  UsersAdmin: undefined;
};

export type HomeStackParamList = {
  HomeMain: undefined;
};

export type WorkStackParamList = {
  WorkMain: undefined;
  WorkModule: { screenId: string; title?: string };
  Attendance: undefined;
  Grades: undefined;
  Discipline: undefined;
  Photography: undefined;
  Schedule: undefined;
  AcademicStats: undefined;
  FormationClasse: undefined;
};

export type FinanceFocus = 'paiements' | 'depenses' | 'moniteur';

export type FinanceStackParamList = {
  FinanceMain: { focus?: FinanceFocus } | undefined;
  FinanceModule: { focus: FinanceFocus; title: string; phase: string };
  Payments: undefined;
  Expenses: undefined;
  FinancialMonitor: undefined;
};

export type AppTabParamList = {
  Home: undefined;
  Work: undefined;
  Children: undefined;
  Students: undefined;
  Finance:
    | undefined
    | {
        screen?: keyof FinanceStackParamList;
        params?: FinanceStackParamList[keyof FinanceStackParamList];
      };
  More: undefined;
};
