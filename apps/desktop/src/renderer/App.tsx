import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SchoolProfileProvider } from './context/SchoolProfileContext';
import { AppLayout } from './layout/AppLayout';
import { DashboardAcademicYearsPage } from './pages/DashboardAcademicYearsPage';
import { DashboardClassesPage } from './pages/DashboardClassesPage';
import { DashboardDepensesPage } from './pages/DashboardDepensesPage';
import { DashboardDisciplinePage } from './pages/DashboardDisciplinePage';
import { DashboardEconomatPage } from './pages/DashboardEconomatPage';
import { DashboardFicheElevePage } from './pages/DashboardFicheElevePage';
import { DashboardPhotographyPage } from './pages/DashboardPhotographyPage';
import { DashboardFormationClassePage } from './pages/DashboardFormationClassePage';
import { DashboardTeacherHubPage } from './pages/DashboardTeacherHubPage';
import { DashboardGradesPage } from './pages/DashboardGradesPage';
import { DashboardHomePage } from './pages/DashboardHomePage';
import { DashboardStatsAcademiquesPage } from './pages/DashboardStatsAcademiquesPage';
import { DashboardStatsFinancieresPage } from './pages/DashboardStatsFinancieresPage';
import { DashboardSchedulePage } from './pages/DashboardSchedulePage';
import { DashboardSchoolPage } from './pages/DashboardSchoolPage';
import { DashboardStudentsImportPage } from './pages/DashboardStudentsImportPage';
import { DashboardStudentsPage } from './pages/DashboardStudentsPage';
import { DashboardSubjectsPage } from './pages/DashboardSubjectsPage';
import { DashboardUsersPage } from './pages/DashboardUsersPage';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './pages/ProtectedRoute';
import { SignupPage } from './pages/SignupPage';

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <SchoolProfileProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardHomePage />} />
              <Route path="students" element={<DashboardStudentsPage />} />
              <Route path="students/import" element={<DashboardStudentsImportPage />} />
              <Route path="classes" element={<DashboardClassesPage />} />
              <Route path="rooms" element={<Navigate to="/dashboard/classes" replace />} />
              <Route path="teachers" element={<Navigate to="/dashboard/classes" replace />} />
              <Route path="subjects" element={<DashboardSubjectsPage />} />
              <Route path="school" element={<DashboardSchoolPage />} />
              <Route path="academic-years" element={<DashboardAcademicYearsPage />} />
              <Route path="schedule" element={<DashboardSchedulePage />} />
              <Route path="grades" element={<DashboardGradesPage />} />
              <Route path="tableau-professeur" element={<DashboardTeacherHubPage />} />
              <Route path="discipline" element={<DashboardDisciplinePage />} />
              <Route path="formation-classe" element={<DashboardFormationClassePage />} />
              <Route path="economat" element={<DashboardEconomatPage />} />
              <Route path="depenses" element={<DashboardDepensesPage />} />
              <Route path="moniteur-finance" element={<Navigate to="/dashboard/stats-financieres?tab=moniteur" replace />} />
              <Route path="comptabilite" element={<Navigate to="/dashboard/stats-financieres?tab=comptabilite" replace />} />
              <Route path="banques" element={<Navigate to="/dashboard/stats-financieres?tab=banques" replace />} />
              <Route path="stats-academiques" element={<DashboardStatsAcademiquesPage />} />
              <Route path="stats-financieres" element={<DashboardStatsFinancieresPage />} />
              <Route path="fiche-eleve" element={<DashboardFicheElevePage />} />
              <Route path="photography" element={<DashboardPhotographyPage />} />
              <Route path="users" element={<DashboardUsersPage />} />
            </Route>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </SchoolProfileProvider>
      </AuthProvider>
    </HashRouter>
  );
}
