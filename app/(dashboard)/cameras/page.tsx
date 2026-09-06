import { PageHeading } from '@/components/layout/page-heading'
import { CameraList } from '@/components/cameras/camera-list'

export default function CamerasPage(): React.JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px]">
      <PageHeading eyebrow="Eyes on your property" title="Cameras" description="Cameras discovered in your uploaded photos. Open a camera to see its photos." />
      <CameraList />
    </div>
  )
}
