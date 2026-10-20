import { Tooltip as PolarisTooltip } from '@shopify/polaris';

export default function Tooltip(props) {
  return <PolarisTooltip {...props} hoverDelay={5000} />;
}
