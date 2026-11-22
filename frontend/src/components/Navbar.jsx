
import { Link, NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

function Navbar() {
    return (
        <nav className="site-navbar">
            {/* LOGO */}
            <Link to="/" className="site-logo">
                <ShieldCheck size={30} />
                <span>
                    RoadGuard <strong>AI</strong>
                </span>
            </Link>

            {/* NAVIGATION LINKS */}
            <div className="site-links">
                <NavLink to="/">Home</NavLink>

                <NavLink to="/scanner">
                    AI Scanner
                </NavLink>

                <NavLink to="/map">
                    Smart City Map
                </NavLink>

                <NavLink to="/admin">
                    Admin Dashboard
                </NavLink>
            </div>

            {/* GET STARTED BUTTON */}
            <Link to="/scanner" className="nav-cta">
                Get Started
            </Link>
        </nav>
    );
}

export default Navbar;
