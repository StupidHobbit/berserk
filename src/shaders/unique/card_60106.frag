#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Темный друид: "life in decay" climbs from the grave flowers into the
// hollow corpse, while the raised staff gathers a grave-fed discharge.
// Anchors are taken from the base 496 x 700 illustration.
float decayOval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.12,1.0,length((p-c)/r));
}
float decayLine(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
vec2 lifeRoot(float f, float branch, float t, float phase) {
    vec2 origin=vec2(0.515,0.535);
    vec2 target=mix(vec2(0.331,0.366),vec2(0.837,0.253),branch);
    vec2 q=mix(origin,target,f);
    q.x+=sin(f*3.14159265)*mix(-0.052,0.110,branch);
    q.x+=sin(f*18.0-t*1.4+phase+branch*2.0)*0.008*sin(f*3.14159265);
    q.y+=sin(f*3.14159265)*mix(-0.017,0.026,branch);
    return q;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    vec3 col=original.rgb;
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float phase=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.544,0.555,p.y));
    art*=smoothstep(0.008,0.020,p.x)*(1.0-smoothstep(0.980,0.992,p.x));
    // Left shield ability badge, including its gold outer edge.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.109,0.182))/vec2(0.060,0.042)));
    float breath=0.5+0.5*sin(t*1.65+phase);
    float chest=decayOval(p,vec2(0.332,0.426),vec2(0.111,0.128));
    float flowers=decayOval(p,vec2(0.502,0.524),vec2(0.193,0.045));
    float greenPaint=smoothstep(0.015,0.18,original.g-original.r)
                    *smoothstep(0.015,0.14,original.g-original.b);
    col+=(1.0-col)*vec3(0.24,0.71,0.10)*chest*(0.13+0.20*breath);
    col+=vec3(0.12,0.34,0.025)*greenPaint*(chest+flowers)*(0.4+0.6*breath);
    col+=(1.0-col)*vec3(0.58,0.72,0.10)*flowers*(0.08+0.18*breath);

    // Two living tendrils: one heals the body, one feeds the staff.
    // Their light travels from the grave, without displacing the source art.
    float root=0.0;
    float haze=0.0;
    for(int i=0;i<24;i++) {
        float k=float(i);
        float branch=step(12.0,k);
        float f=mod(k,12.0)/12.0;
        vec2 a=lifeRoot(f,branch,t,phase);
        vec2 b=lifeRoot(f+1.0/12.0,branch,t,phase);
        float d=decayLine(p,a,b);
        float wave=0.36+0.64*pow(0.5+0.5*sin(f*17.0-t*3.4+phase),3.0);
        float strength=mix(1.0,0.66,branch);
        root=max(root,(1.0-smoothstep(0.0009,0.0025+aa,d))*wave*strength);
        haze=max(haze,exp(-d*d/0.00020)*wave*strength);
    }
    col+=(1.0-col)*vec3(0.19,0.66,0.16)*haze*0.40;
    col+=vec3(0.48,0.76,0.19)*root*0.58;

    // Golden-green spores drift upward from the blooming grave into the
    // corpse's exposed rib cavity, each fading at both ends of its journey.
    float spores=0.0;
    for(int i=0;i<9;i++) {
        float k=float(i);
        float flight=fract(t*(0.095+k*0.003)+k*0.117+phase*0.08);
        vec2 q=lifeRoot(flight,0.0,t,phase);
        q.x+=sin(k*2.43+flight*7.0)*0.043;
        q.y+=cos(k*1.73+flight*4.0)*0.009;
        float d=length((p-q)*vec2(1.0,1.4113));
        float fade=sin(flight*3.14159265);
        spores+=(1.0-smoothstep(0.0013,0.0031+aa,d))*fade;
        spores+=exp(-d*d/0.000065)*fade*0.20;
    }
    col+=vec3(0.65,0.74,0.26)*spores*0.62;

    // The painted green flame stays inside the staff's forked tip.
    vec2 tip=vec2(0.837,0.254);
    float staff=decayOval(p,tip,vec2(0.036,0.041));
    float core=decayOval(p,tip+vec2(-0.001,0.001),vec2(0.012,0.018));
    float flameFlow=0.64+0.36*sin(t*3.5-p.y*93.0+phase);
    col+=(1.0-col)*vec3(0.14,0.86,0.51)*staff*(0.29+0.30*flameFlow);
    col+=vec3(0.41,0.84,0.51)*core*(0.24+0.42*flameFlow);
    float mouth=decayOval(p,vec2(0.316,0.235),vec2(0.018,0.017));
    col+=vec3(0.29,0.48,0.055)*mouth*(0.28+0.35*breath);

    if(u_is_foil) {
        // Grave stone and robe folds gain an emerald / violet metallic
        // finish. Broad spatial interference remains visible at time zero.
        float grave=decayOval(p,vec2(0.591,0.437),vec2(0.102,0.105));
        float robe=decayOval(p,vec2(0.735,0.421),vec2(0.166,0.161));
        float face=decayOval(p,vec2(0.337,0.211),vec2(0.071,0.064))
                  +decayOval(p,vec2(0.700,0.241),vec2(0.036,0.033));
        float material=clamp(0.31+grave*0.44+robe*0.39+chest*0.19,0.0,0.90);
        material*=1.0-clamp(face*0.83,0.0,0.90);
        float folds=p.x*2.7+p.y*1.8+sin(p.y*23.0-p.x*10.0)*0.11;
        vec3 metal=0.5+0.5*cos(6.2831853*(folds-t*0.075+phase*0.04
                                       +vec3(0.04,0.36,0.68)));
        vec3 coated=mix(2.0*col*metal,
                        1.0-2.0*(1.0-col)*(1.0-metal),step(vec3(0.5),col));
        col=mix(col,coated,material*0.47);
        float sheen=pow(0.5+0.5*sin(folds*8.7-t*0.9),6.0);
        col+=(1.0-col)*mix(vec3(0.71,0.88,0.62),metal,0.52)
             *material*(0.13+0.40*sheen);
        col+=mix(vec3(0.46,0.68,0.28),metal,0.45)*root*0.16;
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(col,0.0,1.0),art),original.a);
}
