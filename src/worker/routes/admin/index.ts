import { Hono } from "hono";

import { requireAuth, requireCsrf } from "../../middleware/auth";
import type { AppBindings } from "../../types";
import { activityRoutes } from "./activity";
import { dashboardRoutes } from "./dashboard";
import { domainAdminRoutes } from "./domains";
import { dnsRoutes } from "./dns";
import { registrarRoutes } from "./registrars";
import { settingsRoutes } from "./settings";

export const adminRoutes = new Hono<AppBindings>();
adminRoutes.use("/*", requireAuth);
adminRoutes.use("/*", requireCsrf);
adminRoutes.route("/dashboard", dashboardRoutes);
adminRoutes.route("/domains", domainAdminRoutes);
adminRoutes.route("/", registrarRoutes);
adminRoutes.route("/", dnsRoutes);
adminRoutes.route("/", settingsRoutes);
adminRoutes.route("/", activityRoutes);
