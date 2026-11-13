export interface DaumPostcodeData {
  zonecode: string;
  address: string;
  addressEnglish: string;
  addressType: 'R' | 'J';
  userSelectedType: 'R' | 'J';
  userLanguageType: 'K' | 'E';
  roadAddress: string;
  roadAddressEnglish: string;
  jibunAddress: string;
  jibunAddressEnglish: string;
  autoRoadAddress: string;
  autoRoadAddressEnglish: string;
  autoJibunAddress: string;
  autoJibunAddressEnglish: string;
  buildingCode: string;
  buildingName: string;
  apartment: 'Y' | 'N';
  sido: string;
  sidoEnglish: string;
  sigungu: string;
  sigunguEnglish: string;
  sigunguCode: string;
  roadnameCode: string;
  bcode: string;
  bname: string;
  bnameEnglish: string;
  bname1: string;
  bname1English: string;
  bname2: string;
  bname2English: string;
  hname: string;
  query: string;
}

export interface DaumPostcodeOptions {
  oncomplete?: (data: DaumPostcodeData) => void;
  onclose?: (state: 'FORCE_CLOSE' | 'COMPLETE_CLOSE') => void;
  onresize?: (size: { width: number; height: number }) => void;
  onsearch?: (data: { count: number }) => void;
  width?: string | number;
  height?: string | number;
  autoMapping?: boolean;
  animation?: boolean;
  focusInput?: boolean;
  focusContent?: boolean;
  theme?: Record<string, string>;
}

export interface DaumPostcodeInstance {
  open: (options?: {
    q?: string;
    left?: number;
    top?: number;
    popupTitle?: string;
    popupKey?: string;
    autoClose?: boolean;
  }) => void;
  embed: (
    element: HTMLElement,
    options?: {
      q?: string;
      autoClose?: boolean;
    }
  ) => void;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: DaumPostcodeOptions) => DaumPostcodeInstance;
    };
  }
}
