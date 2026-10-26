/* eslint-disable react/jsx-key -- 섹션은 [제목, 내용] 짝이고 PolicyPage 가 제목을 key 로 쓴다 */
import PolicyPage, { Contact, List, operator } from '@/components/PolicyPage';
import { SERVICE_NAME } from '@/lib/config';

export const metadata = { title: `이용약관 | ${SERVICE_NAME}` };

/** 이용약관 (정식 오픈 전 검토 필요) */
export default function TermsPage() {
  const sections = [
    ['1. 서비스', <p className="m-0">{SERVICE_NAME}는 장소를 시간대에 넣어 여행 동선을 짜고, 가족과 공유하고, 다른 가족의 루트를 가져올 수 있는 서비스예요. 지금은 무료예요.</p>],
    [
      '2. 장소 정보',
      <List
        items={[
          '장소 정보는 한국관광공사 TourAPI 같은 공공데이터, 카카오 검색, 이용자 제보, 운영자 확인으로 모아요.',
          '영업시간·휴무·아이 편의시설은 실제와 다를 수 있어요. 방문 전에 한 번 더 확인해 주세요. 정보가 틀려서 생긴 손해는 고의나 중대한 과실이 없으면 책임지기 어려워요.',
          '이동시간은 예상치예요. 실제 교통 상황에 따라 달라져요.',
        ]}
      />,
    ],
    [
      '3. 이용자가 올리는 것',
      <List
        items={[
          '공개한 루트와 팁, 쓴 돈·한마디(공개를 고른 경우)는 다른 이용자가 보고 자기 일정으로 가져갈 수 있어요.',
          '다른 사람의 개인정보, 광고, 사실이 아닌 내용, 법에 어긋나는 내용은 올리면 안 돼요. 이런 내용은 알리지 않고 숨기거나 지울 수 있어요.',
          '내가 올린 내용의 권리는 나에게 있어요. 서비스 안에서 보여 주고 다른 이용자가 가져가는 데 필요한 만큼만 써요.',
        ]}
      />,
    ],
    [
      '4. 하면 안 되는 것',
      <List items={['다른 사람 계정 쓰기', '자동 프로그램으로 정보를 대량으로 가져가기', '서비스 운영을 방해하기']} />,
    ],
    [
      '5. 서비스 변경·중단',
      <p className="m-0">기능은 바뀌거나 멈출 수 있어요. 이용자에게 영향이 큰 변경은 미리 알려 드려요. 나중에 유료 기능이나 광고가 생기면 따로 알리고, 광고에는 「광고」 표시를 붙여요.</p>,
    ],
    ['6. 탈퇴', <p className="m-0">언제든 탈퇴를 요청할 수 있어요. 처리 방법은 개인정보처리방침을 따라요.</p>],
    [
      '7. 문의',
      <p className="m-0">
        {operator()} · <Contact />
      </p>,
    ],
  ];
  return <PolicyPage title="이용약관" sections={sections} other={{ href: '/privacy', label: '개인정보처리방침 보기' }} />;
}
