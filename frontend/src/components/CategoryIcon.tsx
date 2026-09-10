import React from 'react';
import {
  Users,
  GitBranch,
  Package,
  Cpu,
  Workflow,
  Key,
  Database,
  Globe,
  Server,
  ShieldAlert,
  Shield,
  Layers,
  HelpCircle
} from 'lucide-react';

interface CategoryIconProps {
  iconName?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ iconName, className = 'w-5 h-5', style }) => {
  switch (iconName) {
    case 'Users':
      return <Users className={className} style={style} />;
    case 'GitBranch':
      return <GitBranch className={className} style={style} />;
    case 'Package':
      return <Package className={className} style={style} />;
    case 'Cpu':
      return <Cpu className={className} style={style} />;
    case 'Workflow':
      return <Workflow className={className} style={style} />;
    case 'Key':
      return <Key className={className} style={style} />;
    case 'Database':
      return <Database className={className} style={style} />;
    case 'Globe':
      return <Globe className={className} style={style} />;
    case 'Server':
      return <Server className={className} style={style} />;
    case 'ShieldAlert':
      return <ShieldAlert className={className} style={style} />;
    case 'Shield':
      return <Shield className={className} style={style} />;
    case 'Layers':
      return <Layers className={className} style={style} />;
    default:
      return <HelpCircle className={className} style={style} />;
  }
};
