import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type ResourceName } from '@/lib/types';

export const ResourceDropdown = ({
  selectedResource,
  resourceNames,
  onSelect,
  disabled,
}: {
  disabled?: boolean;
  selectedResource: ResourceName;
  resourceNames: ResourceName[];
  onSelect: (resource: ResourceName) => void;
}) => {
  const handleValueChange = (value: string) => {
    const resource = resourceNames.find(r => r.name === value);
    if (resource) {
      onSelect(resource);
    }
  };

  return (
    <div className='mt-2'>
      <Select disabled={disabled} value={selectedResource.name} onValueChange={handleValueChange}>
        <SelectTrigger className='[&>svg]:text-foreground w-full font-semibold [&>svg]:opacity-100'>
          <SelectValue placeholder='Select a resource' />
        </SelectTrigger>
        <SelectContent className='bg-background'>
          {resourceNames.map((resource, index) => (
            <SelectItem key={index} value={resource.name}>
              {resource.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
