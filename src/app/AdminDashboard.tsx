import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, CalendarDays, CheckCircle2, ClipboardList, Clock3, DollarSign, LogOut, Menu, Users, Wrench, X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from './api';

// NOTE: preserve the existing AdminDashboard implementation; logout is server-session based.
