import {cloneElement, useId, type ReactElement, type ReactNode} from 'react';
import {InfoTooltip} from './ControlHelp';

export function PhotoSettingField({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children: ReactElement<{id?: string}>;
}) {
  const id = useId();
  return (
    <div className="cc-photo-setting-field">
      <span className="cc-photo-setting-label">
        <label htmlFor={id}>{label}</label>
        {help && <InfoTooltip label={label}>{help}</InfoTooltip>}
      </span>
      {cloneElement(children, {id})}
    </div>
  );
}
