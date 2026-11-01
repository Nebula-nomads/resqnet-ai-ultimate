import React from "react";
import {
  Ambulance, Cog, Flame, HardHat, HeartPulse, LifeBuoy, Package, Search, ShieldCheck, Ship,
  Siren, Stethoscope, Truck, Users, Wrench, Zap,
} from "lucide-react";

const RULES: Array<[RegExp, React.ElementType]> = [
  [/boat/i, Ship],
  [/life ?jacket/i, LifeBuoy],
  [/ambulance/i, Ambulance],
  [/paramedic/i, HeartPulse],
  [/first[ -]?aid|medical (team|supplies)/i, Stethoscope],
  [/fire engine/i, Flame],
  [/protective|gear/i, ShieldCheck],
  [/search|rescue/i, Search],
  [/crane/i, Truck],
  [/repair|crew/i, Wrench],
  [/generator/i, Zap],
  [/spare|parts/i, Cog],
  [/suppl/i, Package],
  [/team/i, Users],
];

export const resourceIcon = (name: string): React.ElementType => {
  for (const [re, Icon] of RULES) if (re.test(name)) return Icon;
  return name.match(/hard|helmet/i) ? HardHat : Siren;
};

export const ResourceIcon: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 18, className }) => {
  const Icon = resourceIcon(name);
  return <Icon size={size} className={className} aria-hidden />;
};
