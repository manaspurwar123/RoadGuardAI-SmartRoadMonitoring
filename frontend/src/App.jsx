
import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import SmartCityMap from "./pages/SmartCityMap";
import Scanner from "./pages/Scanner";
import AdminDashboard from "./pages/AdminDashboard";
import AdminLogin from "./pages/AdminLogin";

import "./App.css";

function App() {
  return (
    <BrowserRouter>
      <Navbar />

      <Routes>
        <Route path="/" element={<Home />} />

        <Route
          path="/scanner"
          element={<Scanner />}
        />

        <Route
          path="/map"
          element={<SmartCityMap />}
        />

        <Route
          path="/admin/login"
          element={<AdminLogin />}
        />

        <Route element={<ProtectedRoute />}>
          <Route
            path="/admin"
            element={<AdminDashboard />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
