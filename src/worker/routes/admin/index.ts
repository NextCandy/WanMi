import { Hono } from "hono";

import { requireAuth, requireCsrf } from "../../middleware/auth";
import type { AppBindings } from "../../types";
import { activityRoutes } from "./activity";
import { aiConfigRoutes } from "./ai-configs";
import { categoryRoutes } from "./categories";
import { dashboardRoutes } from "./dashboard";
import { domainAdminRoutes } from "./domains";
import { settingsRoutes } from "./settings";

export const adminRoutes = new Hono<AppBindings>();
adminRoutes.use("/*", requireAuth);
adminRoutes.use("/*", requireCsrf);
adminRoutes.route("/dashboard", dashboardRoutes);
adminRoutes.route("/domains", domainAdminRoutes);
adminRoutes.route("/", settingsRoutes);
adminRoutes.route("/", activityRoutes);
adminRoutes.route("/", aiConfigRoutes);
adminRoutes.route("/", categoryRoutes);
