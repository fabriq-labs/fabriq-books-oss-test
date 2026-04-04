import Cookies from "js-cookie";
export function decodeJwt() {
    try {
        const token = Cookies.get("__session");
        if (!token) {
            console.warn("No JWT token found in cookies");
            return null;
        }
        const parts = token.split(".");

        if (parts.length !== 3) {
            console.warn("Invalid JWT token format");
            return null;
        }
        const payload = JSON.parse(atob(parts[1]));
        return payload;
    } catch (error) {
        console.error("Error decoding JWT token:", error);
        return null;
    }
}

export const getUserDetails = () => {
    const decoded = decodeJwt();
    if (!decoded) {
        return null;
    }
    return {
        user_id: decoded.user_id,
        name: decoded.name,
        email: decoded.email,
        org_role: decoded.org_role,
        org_permissions: decoded.org_permissions,
        org_slug: decoded.org_slug,
        organization: decoded.organization,
        org_id: decoded.org_id
    };
};

export const getOrgDetails = () => {
    const decoded = decodeJwt();
    if (!decoded) {
        return null;
    }
    return {
        org_role: decoded.org_role,
        org_slug: decoded.org_slug,
        organization: decoded.organization,
        org_id: decoded.org_id
    };
};

