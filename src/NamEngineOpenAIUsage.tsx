import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleOff,
  Clock3,
  DollarSign,
  Image,
  LayoutDashboard,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  XCircle,
  Zap,
} from 'lucide-react'

import { fetchUsageReport, TelemetryError, type UsageMetric, type Usage