
"use client";


import styles from "./IncomingCorrespondenceForm.module.css";
type IncomingCorrespondenceFormProps = {
    incomingNumber: string;
    setIncomingNumber: (value: string) => void;
    entityName: string;
    setEntityName: (value: string) => void;
};

export default function IncomingCorrespondenceForm({
    incomingNumber,
    setIncomingNumber,
    entityName,
    setEntityName,
}: IncomingCorrespondenceFormProps) {






    const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Tripoli",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());


    return (
        <section dir="rtl" className={styles.card}>
            <div className={styles.heading}>
                <h2 className={styles.title}>
                    بيانات المراسلة الواردة
                </h2>
                <p className={styles.subtitle}>
                    أدخل بيانات المراسلة الإدارية المرتبطة بالعقود.
                </p>
            </div>

            <div className={styles.fields}>
                <div className={styles.field}>
                    <label
                        htmlFor="incoming-number"
                        className={styles.label}
                    >
                        رقم الوارد <span className={styles.required}>*</span>
                    </label>
                    <input
                        id="incoming-number"
                        className={styles.input}
                        type="text"
                        required
                        value={incomingNumber}
                        onChange={(event) =>
                            setIncomingNumber(event.target.value)
                        }
                        placeholder="أدخل رقم الوارد"
                    />
                </div>

                <div className={styles.field}>
                    <label
                        htmlFor="incoming-date"
                        className={styles.label}
                    >
                        تاريخ الوارد
                    </label>
                    <input
                        id="incoming-date"
                        className={styles.input}
                        type="text"
                        readOnly
                        value={today}
                    />
                </div>

                <div className={styles.field}>
                    <label
                        htmlFor="entity-name"
                        className={styles.label}
                    >
                        الجهة الإدارية المرسلة{" "}
                        <span className={styles.required}>*</span>
                    </label>
                    <input
                        id="entity-name"
                        className={styles.input}
                        type="text"
                        required
                        value={entityName}
                        onChange={(event) =>
                            setEntityName(event.target.value)
                        }
                        placeholder="أدخل اسم الجهة الإدارية"
                    />
                </div>
            </div>
        </section>
    );

}
