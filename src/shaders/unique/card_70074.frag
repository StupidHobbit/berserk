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

// Лазурный дракон: icy breath washes over the castle and stops its action.
// Coordinates below follow the painted mouth, breath cone and raised ice orb.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.41129/max(u_resolution.y,1.0));
    float seed=fract(u_seed*0.137);
    float t=max(u_time,0.0);
    float clock=t+seed*2.1;
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.547,0.559,p.y));
    art*=smoothstep(0.007,0.020,p.x)*(1.0-smoothstep(0.979,0.992,p.x));
    // The three printed ability emblems and the sword's numeral are untouched.
    art*=clamp(smoothstep(0.178,0.198,p.x)+smoothstep(0.383,0.400,p.y),0.0,1.0);
    vec3 color=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float exhale=0.5+0.5*sin(clock*1.35);

    // A tapered stream starts exactly at the open mouth and follows the
    // diagonal white breath already painted toward the left castle towers.
    vec2 mouth=vec2(0.465,0.268);
    vec2 q=(p-mouth)*vec2(1.0,1.41129);
    vec2 direction=normalize(vec2(-0.330,0.185));
    float along=dot(q,direction);
    float across=dot(q,vec2(-direction.y,direction.x));
    float envelope=smoothstep(-0.012,0.020,along)*(1.0-smoothstep(0.285,0.410,along));
    float width=0.012+max(along,0.0)*0.20;
    float stream=exp(-across*across/(width*width))*envelope;
    float advancing=pow(0.5+0.5*cos(along*57.0-clock*4.1),4.0);
    color+=(1.0-color)*vec3(0.29,0.78,0.96)*stream*(0.17+0.34*advancing+0.12*exhale);
    float ribbons=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i)-1.0;
        float center=k*width*0.66+sin(along*25.0-clock*2.4+k*2.0)*width*0.19;
        float d=abs(across-center);
        ribbons+=(1.0-smoothstep(0.0015,0.0035+aa,d))*envelope;
    }
    color+=(1.0-color)*vec3(0.51,0.88,1.0)*ribbons*(0.12+0.24*advancing);
    float frozen=oval(p,vec2(0.286,0.451),vec2(0.250,0.110));
    float stone=smoothstep(0.18,0.60,lum)*frozen;
    float freezeWave=pow(0.5+0.5*sin(p.y*46.0+p.x*16.0-clock*2.3),5.0);
    color+=(1.0-color)*vec3(0.24,0.65,0.91)*stone*(0.12+0.26*freezeWave);

    // Ice shards travel outward within the breath, each widening as it
    // approaches the wall. They have a visible static arrangement at t=0.
    float shards=0.0;
    for(int i=0;i<12;i++) {
        float k=float(i);
        float f=fract(clock*0.16+k*0.083333+seed*0.16);
        float distance=0.025+f*0.335;
        float offset=sin(k*8.71+seed*3.0)*(0.004+distance*0.12);
        vec2 center=direction*distance+vec2(-direction.y,direction.x)*offset;
        vec2 z=q-center;
        float size=0.003+0.004*f;
        float diamond=abs(z.x)*0.65+abs(z.y);
        float life=smoothstep(0.0,0.12,f)*(1.0-smoothstep(0.78,1.0,f));
        shards+=(1.0-smoothstep(size,size+aa,diamond))*life;
    }
    color+=(1.0-color)*vec3(0.64,0.93,1.0)*shards*0.83;

    // The dragon's right claw holds the second source of cold magic.
    vec2 orb=vec2(0.883,0.367);
    vec2 oq=(p-orb)*vec2(1.0,1.41129);
    float od=length(oq);
    float orbGlow=exp(-od*od/0.0016);
    color+=(1.0-color)*vec3(0.03,0.64,1.0)*orbGlow*(0.26+0.35*exhale);
    float corona=0.0;
    for(int i=0;i<2;i++) {
        float k=float(i);
        float f=fract(clock*0.24+k*0.5);
        float d=abs(od-(0.022+f*0.043));
        float ring=1.0-smoothstep(0.001,0.0025+aa,d);
        corona+=ring*sin(f*3.14159265)*(0.5+0.5*sin(atan(oq.y,oq.x)*3.0+clock*2.0+k));
    }
    color+=(1.0-color)*vec3(0.22,0.79,1.0)*corona*0.45;

    float wings=clamp(oval(p,vec2(0.808,0.226),vec2(0.259,0.115))
                    +oval(p,vec2(0.283,0.192),vec2(0.247,0.099)),0.0,1.0);
    float neck=oval(p,vec2(0.631,0.330),vec2(0.096,0.126));
    float scales=smoothstep(0.035,0.20,base.b-base.r)*smoothstep(0.10,0.43,lum);
    float coldWave=pow(0.5+0.5*sin(p.y*24.0-p.x*13.0+clock*1.4),5.0);
    color+=(1.0-color)*vec3(0.06,0.45,0.63)*(wings+neck)*scales*(0.08+0.20*coldWave);

    if(u_is_foil) {
        // Polished azure scales and opalescent wing membranes retain a
        // strong spectral finish even when reduced motion freezes time.
        float phase=p.x*1.72+p.y*2.45+0.13*sin(p.x*12.0-p.y*19.0)-t*0.09+seed*0.18;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        vec3 coated=mix(2.0*color*spectrum,
                       1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float face=oval(p,vec2(0.478,0.238),vec2(0.069,0.043));
        color=mix(color,coated,(0.25+0.24*wings+0.15*neck)*(1.0-face*0.70));
        float polish=pow(0.5+0.5*sin(p.x*15.0+p.y*24.0-t*1.1),7.0);
        float metal=clamp(0.18+scales*(wings+neck)*0.90+stone*0.28,0.0,1.0);
        color+=(1.0-color)*mix(vec3(0.65,0.90,1.0),spectrum,0.56)*metal*(0.19+0.44*polish);
        color+=(1.0-color)*mix(vec3(0.80,0.97,1.0),spectrum,0.30)*(shards*0.35+corona*0.45);
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
