import { Fragment } from 'react'

/**
 * 가운뎃점(·) 뒤에서도 줄을 바꿀 수 있게 그린다(UX U1, U5).
 * 한국어는 단어 단위로 줄을 바꾸는데(keep-all), "가스레인지·인덕션"처럼 가운뎃점으로 이은 말은 한 단어로 묶여
 * 좁은 칸에서 글자 중간에 끊긴다. 글자 내용(textContent)과 읽기용 이름은 그대로다.
 */
function BreakableText({ text }: { text: string }) {
  const parts = text.split('·')
  return (
    <>
      {parts.map((part, index) =>
        index === 0 ? (
          part
        ) : (
          <Fragment key={index}>
            ·<wbr />
            {part}
          </Fragment>
        ),
      )}
    </>
  )
}

export default BreakableText
